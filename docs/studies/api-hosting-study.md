# API Hosting — Technology Selection Study

**Project:** Net Worth Dashboard
**Status:** Proposed decision | **Date:** 2026-11-25
**Scope:** Where the Python/FastAPI backend runs in production on AWS, and how it reaches the database and receives requests. Architecture is out of scope.

**Context:** the API is reached through CloudFront under `/api/*` (see [frontend-runtime-study.md](frontend-runtime-study.md)) and uses Aurora Serverless v2, which pauses when idle and needs about 15 seconds to resume (see [storage-study.md](storage-study.md)). Traffic is low and irregular.

## 1. Requirements

**Hard requirements**

- **H1:** Run the FastAPI application, built by CI from the repository.
- **H2:** Reach Aurora privately inside a VPC, without exposing the database to the internet.
- **H3:** Act as a CloudFront origin over HTTPS for `/api/*`.
- **H4:** Allow requests of at least 30 seconds, so the first request after Aurora pauses succeeds.
- **H5:** Run with least-privilege IAM permissions and no secrets in code or images.
- **H6:** Be defined in AWS CDK.

**Soft requirements**

- **S1:** Lowest cost at low, irregular traffic, including network costs (load balancers, NAT, VPC endpoints, public IPv4 addresses) (NFR-11).
- **S2:** Local parity: the image that runs under Podman Compose also runs in production (NFR-12).
- **S3:** Low operational effort: no operating system to patch, automatic scaling and recovery.
- **S4:** Acceptable latency, including cold starts.
- **S5:** Does not keep database connections open while idle, so Aurora can pause.
- **S6:** Can run scheduled jobs, such as revaluation reminders (FR-17).

## 2. Options Considered and Hard-Requirement Screening

| Option | Hard requirements | Outcome |
|---|---|---|
| AWS Lambda (container image with Lambda Web Adapter) behind API Gateway HTTP API | H1–H6; HTTP API allows up to 30 seconds | Retain |
| Amazon ECS on Fargate behind an Application Load Balancer | H1–H6 | Retain |
| AWS App Runner with a VPC connector | H1–H6 | Retain |
| Amazon EC2 (single small instance running Podman) | H1–H6 | Retain |
| ~~Lambda Function URL with CloudFront Origin Access Control~~ | Meets H1–H6, but POST and PUT requests must carry a SHA-256 payload hash header computed by the browser | **Not shortlisted** |
| ~~Amazon Lightsail containers~~ | Cannot reach an Aurora cluster in a custom VPC without peering workarounds (H2) | **Exclude** |
| ~~Lambda outside a VPC, using the Aurora Data API~~ | Meets H2, but needs a non-standard SQLAlchemy dialect and cannot be reproduced against local PostgreSQL | **Exclude** |

## 3. Comparative Assessment (Qualitative)

**Method:** capability and operational assessment, **not a measured test**. Costs are indicative (us-east-1, late 2026) and must be checked against current AWS pricing.

| Option | S1 Cost (idle month) | S2 Local parity | S3 Operations | S4 Latency | S5 Lets Aurora pause | S6 Scheduled jobs | Assessment |
|---|---|---|---|---|---|---|---|
| **Lambda + HTTP API** | Near zero (Lambda free tier; ≈ $1 per million API requests) | Same image, with the Web Adapter added in a final stage | Nothing to patch; scales to zero | Cold start of 1–2 s after idle periods | Yes, if connections are closed after each request | EventBridge Scheduler invoking a function | **Best overall fit** |
| **ECS on Fargate + ALB** | ≈ $25/month (always-on 0.25 vCPU task ≈ $7 + ALB ≈ $16 + public IPv4) | Same image | Managed tasks; image patching | No cold start | Yes, with a short pool idle timeout | Scheduled ECS tasks | Strong when traffic is steady |
| **App Runner** | ≈ $3/month idle memory, plus active compute | Same image | Fully managed | No cold start once provisioned | Yes, with a short pool idle timeout | No built-in scheduler | Viable; verify the service's current availability and roadmap before choosing |
| **EC2 + Podman** | ≈ $6–10/month (t4g.micro + public IPv4) | Same compose setup | OS patching, backups, TLS, recovery all manual | No cold start | Yes, with a short pool idle timeout | cron | Cheap but highest effort |

**Hidden network costs.** Anything in a VPC that needs outbound internet access needs either a NAT gateway (≈ $32/month plus data) or VPC interface endpoints (≈ $7/month each, per Availability Zone). These would exceed the rest of the bill. The design must avoid them:

- Use **IAM database authentication** for Aurora: the token is signed locally by the SDK, so no call to Secrets Manager is needed.
- Validate **Cognito tokens without an outbound call**, for example with the API Gateway JWT authorizer, or with signing keys provided at deploy time. To be settled in the authentication design.
- Place the API in **private isolated subnets** with no route to the internet.

**Lambda and connections.** A frozen Lambda environment can keep its database connection open, which would stop Aurora from pausing. The API must open and close a connection per request on Lambda (SQLAlchemy `NullPool`); RDS Proxy must not be used.

## 4. Final Selection

**Select: AWS Lambda running the API container image, behind an API Gateway HTTP API, as the CloudFront origin for `/api/*`.**

- **Image:** the same multi-stage API Containerfile used under Podman Compose, with a final stage that adds the AWS Lambda Web Adapter, so uvicorn and FastAPI run unchanged. Built for arm64 and pushed to Amazon ECR by CI.
- **Function:** arm64, 512 MB memory to start, 29-second timeout, in private isolated subnets with a security group allowed to reach Aurora only.
- **Database access:** IAM database authentication; `NullPool` on Lambda, configured by environment variable so local development keeps a normal pool.
- **Routing:** CloudFront `/api/*` behaviour → HTTP API, with caching disabled and the `Authorization` header and cookies forwarded.
- **Scheduled jobs:** separate functions from the same image, triggered by EventBridge Scheduler.
- **Network:** no NAT gateway, no VPC endpoints, no load balancer.

**Rationale:** with traffic that is low and irregular, paying per request costs almost nothing, while every container option has a fixed monthly cost, mostly for the load balancer. The Web Adapter keeps the production image the same as the local one. The cold start of 1–2 seconds is small next to Aurora's resume time, which the app must handle anyway.

**Trade-offs:** requests are limited to 30 seconds and responses to API Gateway's payload limits, which rule out long-running requests and streaming. Lambda's process model differs slightly from local uvicorn (no state between requests, no background tasks after the response); the API must not depend on either.

**Runner-up:** ECS on Fargate, if traffic becomes steady enough that per-request pricing exceeds an always-on task, or if the API needs long-running requests, streaming (Server-Sent Events), or WebSockets. The image is the same, so the move is limited to infrastructure code.

**Validation before production:** on the staging stack, measure the cold start with and without a paused Aurora cluster, confirm that Aurora pauses after the idle period while the API is deployed, and check that no traffic requires internet access from the VPC.

## References

- AWS Lambda Web Adapter — [awslabs/aws-lambda-web-adapter](https://github.com/awslabs/aws-lambda-web-adapter)
- AWS Lambda — [Giving Lambda functions access to resources in an Amazon VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)
- Amazon API Gateway — [HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- Amazon Aurora — [IAM database authentication](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/UsingWithRDS.IAMDBAuth.html)
- Amazon Aurora — [Scaling to zero ACUs with automatic pause and resume](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html)
- Amazon CloudFront — [Restricting access to a Lambda function URL origin](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html)
