# Primer: Networking Fundamentals

> A brush-up for the two networking lessons ([Networking in AWS](../aws/06-networking-in-aws.md), [Networking in GCP](../gcp/08-networking-in-gcp.md)) and anywhere else CIDR ranges, ports, or firewalls show up. You do **not** need to memorise this — read it once, then come back when a lab pastes something like `10.30.0.0/16` and you want to know what it means.

## IP addresses

An **IPv4 address** is four numbers (0–255) separated by dots: `10.30.1.5`. Each number is one *octet* (8 bits), so an address is 32 bits total. Every network interface — your laptop, a VM, a load balancer — has at least one.

A **port** is a second number (0–65535) that says *which program* on that host. An address gets the packet to the machine; the port gets it to the right process. `10.30.1.5:8080` means "port 8080 on host 10.30.1.5". Conventions you will see:

| Port | Service |
| --- | --- |
| 22 | SSH |
| 80 | HTTP |
| 443 | HTTPS (HTTP over TLS) |
| 8080 | common alternate HTTP for apps |

**TCP vs UDP** are the two transport protocols riding on top of IP. TCP is connection-oriented and reliable (web, SSH, databases); UDP is fire-and-forget (DNS lookups, some streaming). Firewall rules name a protocol and a port, e.g. `tcp:22`.

## CIDR notation and subnet masks

This is the one to actually understand — it drives every subnet in the labs.

`10.30.0.0/16` is a **CIDR block**: an address plus a `/N` **prefix length**. The `/N` says "the first N bits are fixed (the network); the remaining `32 − N` bits are free (the hosts)." More fixed bits ⇒ smaller range.

| CIDR | Fixed bits | Free bits | Addresses | Rough size |
| --- | --- | --- | --- | --- |
| `/8`  | 8  | 24 | 16,777,216 | a whole `10.x.x.x` |
| `/16` | 16 | 16 | 65,536 | one "class B" |
| `/20` | 20 | 12 | 4,096 | a big subnet |
| `/24` | 24 | 8  | 256 | a typical subnet |
| `/28` | 28 | 4  | 16 | a tiny slice |
| `/32` | 32 | 0  | 1 | exactly one host |

**Worked example.** A VPC gets `10.30.0.0/16` — that reserves everything from `10.30.0.0` to `10.30.255.255`. You then carve it into `/24` subnets by changing the third octet:

- `10.30.0.0/24`  → `10.30.0.0`–`10.30.0.255`   (public, AZ a)
- `10.30.1.0/24`  → `10.30.1.0`–`10.30.1.255`   (public, AZ b)
- `10.30.10.0/24` → `10.30.10.0`–`10.30.10.255` (private, AZ a)
- `10.30.11.0/24` → `10.30.11.0`–`10.30.11.255` (private, AZ b)

These four `/24`s all fit inside the `/16` and don't overlap — that is the whole trick. **Subnets in the same VPC must not overlap**, which is why "secondary range conflict" is a common lab error.

`0.0.0.0/0` is the special "match every address" block. In a route table it means "the default route — send anything I don't have a more specific rule for here." In a firewall rule it means "from/to anywhere on the internet."

(A *subnet mask* like `255.255.255.0` is the same idea written the old way: `/24` = 24 one-bits = `255.255.255.0`. Cloud tooling uses `/N`, so prefer that.)

## Public vs private IP (RFC 1918)

Three IPv4 ranges are reserved for **private** use — they are not routable on the public internet, and everyone reuses them inside their own network:

- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`

That is why the labs build VPCs out of `10.x` addresses. A **private IP** is only reachable inside the VPC. A **public IP** is globally routable; a resource needs one (or something in front of it) to be reached from the internet. In the labs, `--map-public-ip-on-launch` (AWS) or omitting `--no-address` (GCP) is what gives a VM a public IP.

## NAT: how private resources reach out

A VM with only a private IP still often needs to `apt-get`/`dnf` updates from the internet. **NAT (Network Address Translation)** solves the one-way case: a **NAT Gateway** (AWS) or **Cloud NAT** (GCP) rewrites the private source address to a shared public one on the way out, and rewrites the replies on the way back. Outbound works; unsolicited **inbound** does not. That is exactly what you want for a private app tier.

## Routing and route tables

A **route table** is a list of "for destination X, send packets to next-hop Y". Each subnet is associated with one route table. The rules the labs create:

- Public subnet: `0.0.0.0/0 → internet gateway` (can reach the internet directly)
- Private subnet: `0.0.0.0/0 → NAT gateway` (reaches the internet only outbound, via NAT)

The most *specific* matching route wins, and `0.0.0.0/0` is the least specific — the fallback.

## Firewalls: stateful vs stateless

- **Stateful** (AWS security groups, GCP firewall rules): the firewall *remembers* connections you allowed. If you allow inbound port 80, the reply traffic is automatically allowed back out — you only write one rule. This is what you use 95% of the time.
- **Stateless** (AWS Network ACLs): each packet is judged on its own. Allowing inbound does **not** allow the reply — you must also add the matching outbound rule. Forgetting the return rule is the classic NACL bug.

"Ingress" = traffic coming *in*; "egress" = traffic going *out*.

## A few names you'll meet

- **DNS** — turns a name (`storage.googleapis.com`) into an IP. "Enable DNS hostnames" lets resources inside the VPC resolve each other by name.
- **ENI** (AWS Elastic Network Interface) — a virtual NIC attached to an instance; it holds the private/public IPs.
- **Elastic IP** (AWS) / **external IP** (GCP) — a public IP you reserve so it doesn't change.
- **Load balancer** — one stable front-end IP that spreads requests across many backends. Layer 7 (ALB / HTTP LB) routes by hostname/path; Layer 4 (NLB / TCP LB) forwards raw TCP/UDP.
- **WAF** (Web Application Firewall, e.g. AWS WAF / Cloud Armor) — inspects HTTP *content* (SQL injection, rate limits), which a plain IP/port firewall cannot.
- **VPC endpoint / Private Google Access** — reach a cloud service (S3, `googleapis.com`) over the provider's own network instead of the public internet.

## Check yourself

- How many addresses are in a `/24`? In a `/28`?
- Why can't two subnets in one VPC be `10.30.0.0/24` and `10.30.0.128/25`?
- A VM has no public IP but can still `curl https://example.com`. What made that work?
- You allowed inbound `tcp:443` on a stateless NACL and replies still fail. What's missing?

## Go deeper

- [AWS VPC concepts](https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html)
- [Google VPC overview](https://cloud.google.com/vpc/docs/overview)
- [RFC 1918 — private address space](https://datatracker.ietf.org/doc/html/rfc1918)
