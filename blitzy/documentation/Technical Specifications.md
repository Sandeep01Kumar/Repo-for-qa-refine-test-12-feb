# Technical Specification

# 0. Agent Action Plan

## 0.1 Intent Clarification

### 0.1.1 Core Feature Objective

Based on the prompt, the Blitzy platform understands that the new feature requirement is to establish and enhance the **hao-backprop-test** repository as a fully functional test fixture for Backprop integration validation. The user has described a codebase that serves as a minimal "Hello World" Node.js server whose explicit purpose is integration testing with Backprop — a tool or service used for code analysis, refactoring, or AI-assisted development.

The following feature requirements have been identified with enhanced clarity:

- **Preserve and Maintain the Node.js HTTP Server**: The existing `server.js` file implements a single-endpoint HTTP server binding to `127.0.0.1:3000` that responds to every request with `200 OK` and `"Hello, World!\n"`. This server must remain functional and serve as the primary runtime component for Backprop to analyze.
- **Support Backprop Integration Testing**: The repository is explicitly designed as a controlled, deterministic test fixture against which Backprop can reliably perform code analysis. The flat file structure, zero external dependencies, and multi-format artifact collection all support this objective.
- **Maintain Test Project Classification**: The project is clearly marked as a test project (`README.md` states "test project for backprop integration. Do not touch!") and is not intended for production use. All modifications must respect this classification.

Implicit requirements detected:

- The zero-dependency baseline established in `package.json` and `package-lock.json` must be preserved to ensure clean dependency analysis by Backprop
- The `main` field discrepancy in `package.json` (pointing to non-existent `index.js` instead of `server.js`) serves as an intentional edge-case test and should be documented
- Multi-format file artifacts (`LoginTest.java`, `industry.csv`, `test.py.txt`, `test.blitzyignore.txt`, `test1.blitzyignore.txt`) exist to validate Backprop's ability to handle heterogeneous file types and must be retained

### 0.1.2 Special Instructions and Constraints

- **Immutability Directive**: The `README.md` explicitly states "Do not touch!" — establishing a constraint that the repository's existing files should remain unmodified to preserve test baseline integrity. Any new feature additions must be additive rather than modifying existing files unless strictly necessary.
- **Zero-Dependency Constraint**: The project intentionally has zero external npm dependencies, as confirmed by `package-lock.json` (lockfileVersion 3 with only the root project entry). This isolation guarantees that Backprop's analysis results are attributable to the tooling, not application complexity.
- **Localhost-Only Binding**: The server binds to `127.0.0.1`, not `0.0.0.0`, confining all HTTP interactions to the local machine. This architectural constraint must be maintained.
- **Flat Repository Structure**: All files exist at the repository root with no subdirectories. Any new files introduced for the feature should follow the project's existing organizational pattern unless explicitly required otherwise.
- **No Production Use**: The user has explicitly emphasized this is a test project and not meant for production use. All implementation decisions should prioritize simplicity and testability over production-readiness.

### 0.1.3 Technical Interpretation

These feature requirements translate to the following technical implementation strategy:

- To **maintain the HTTP server as a Backprop test target**, we will preserve the existing `server.js` with its `http.createServer()` pattern, hardcoded hostname/port constants, and catch-all request handler returning the static `"Hello, World!\n"` response.
- To **support multi-format artifact testing**, we will retain all existing test artifacts (`LoginTest.java`, `industry.csv`, `test.blitzyignore.txt`, `test1.blitzyignore.txt`, `test.py.txt`) in their current state at the repository root.
- To **preserve the zero-dependency baseline**, we will ensure that `package.json` continues to declare no `dependencies` or `devDependencies` fields, and `package-lock.json` remains locked at version 3 with only the root project entry.
- To **maintain package metadata integrity**, we will keep the `package.json` metadata intact: `name: "hello_world"`, `version: "1.0.0"`, `author: "hxu"`, `license: "MIT"`, including the intentional `main: "index.js"` discrepancy that tests Backprop's manifest analysis capabilities.
- To **respect the immutability directive**, all enhancements will be minimal and additive, ensuring the repository remains a controlled, deterministic test fixture.

## 0.2 Repository Scope Discovery

### 0.2.1 Comprehensive File Analysis

The repository has a **flat structure** with all files located at the root level and no subdirectories. A thorough analysis of every file has been conducted to determine its role, modification status, and relevance to the Backprop integration feature.

**Existing Files — Complete Inventory**

| File | Format | Size | Role | Modification Status |
|------|--------|------|------|---------------------|
| `server.js` | JavaScript | 342 B | Core runtime — Node.js HTTP server binding to `127.0.0.1:3000`, responds with `"Hello, World!\n"` | PRESERVE — Primary Backprop analysis target |
| `package.json` | JSON | ~280 B | npm manifest — declares `hello_world@1.0.0`, author `hxu`, MIT license, `main: "index.js"` (intentional discrepancy) | PRESERVE — Backprop manifest analysis target |
| `package-lock.json` | JSON | ~180 B | Lockfile — lockfileVersion 3, confirms zero external dependencies | PRESERVE — Backprop dependency analysis target |
| `README.md` | Markdown | 66 B | Documentation — project identity and immutability directive ("Do not touch!") | PRESERVE — May require minimal additive update for feature documentation |
| `LoginTest.java` | Java | 128 B | Test artifact — non-compilable `com.blitzyTest` skeleton with invalid `Web` token | PRESERVE — Multi-language parsing test for Backprop |
| `industry.csv` | CSV | 749 B | Test artifact — 43 industry categories in single-column format | PRESERVE — Structured data parsing test for Backprop |
| `test.blitzyignore.txt` | Text | 0 B | Marker file — Blitzy ignore pattern recognition test | PRESERVE — Blitzy integration marker |
| `test1.blitzyignore.txt` | Text | 0 B | Marker file — Blitzy ignore pattern recognition test | PRESERVE — Blitzy integration marker |
| `test.py.txt` | Text | 0 B | Marker file — double-extension edge-case test for file-type classification | PRESERVE — File extension handling test for Backprop |

**Integration Point Discovery**

- **API Endpoints**: The sole endpoint is a catch-all handler in `server.js` (lines 6–10) that responds to every HTTP request regardless of method, path, or headers. No routing or endpoint registration exists.
- **Database Models/Migrations**: None. The application is entirely stateless with no persistence layer.
- **Service Classes**: None. The entire application logic is a single anonymous callback function within `http.createServer()`.
- **Controllers/Handlers**: The anonymous callback at `server.js:6` serves as the only handler. It sets `statusCode = 200`, `Content-Type: text/plain`, and calls `res.end('Hello, World!\n')`.
- **Middleware/Interceptors**: None. The `http` module is used directly without any middleware pattern.
- **Configuration Files**: `package.json` is the only configuration file. No `.env`, `config.yaml`, or environment-specific configuration exists.
- **CI/CD Pipelines**: None. No `.github/workflows/`, `Jenkinsfile`, `.gitlab-ci.yml`, or similar CI/CD configuration exists.

### 0.2.2 Web Search Research Conducted

No web search research was required for this feature implementation, as:

- The project uses exclusively the Node.js built-in `http` module, which is a stable, well-documented core API
- No external libraries, frameworks, or third-party integrations are involved
- The project's purpose as a Backprop test fixture is fully documented in the repository itself (`README.md`) and the existing technical specification
- Security considerations are minimal due to the localhost-only binding and zero-dependency baseline

### 0.2.3 New File Requirements

Given the project's explicit immutability directive ("Do not touch!") and its nature as a minimal test fixture, no new files are required for the current feature scope. The existing file inventory is complete and sufficient for the Backprop integration testing purpose described by the user.

**New Source Files**: None required — the `server.js` file fully implements the described HTTP server functionality.

**New Test Files**: None required — the `package.json` test script remains at the default npm placeholder (`echo "Error: no test specified" && exit 1`), consistent with the project's test fixture role where the repository itself is the test input rather than the test executor.

**New Configuration Files**: None required — the zero-dependency, single-file architecture requires no additional configuration beyond the existing `package.json`.

## 0.3 Dependency Inventory

### 0.3.1 Private and Public Packages

The project operates on a **zero-dependency baseline** — a deliberate architectural decision that is central to its role as a Backprop integration test fixture. No external npm packages are declared in `package.json` (no `dependencies` or `devDependencies` fields exist), and `package-lock.json` confirms this with only the root project entry.

**Runtime Dependencies**

| Registry | Package Name | Version | Purpose |
|----------|-------------|---------|---------|
| Node.js built-in | `http` | (bundled with Node.js) | Core HTTP server creation via `http.createServer()` — the only module imported in the entire codebase |

**Platform Dependencies**

| Component | Version | Source of Truth | Purpose |
|-----------|---------|----------------|---------|
| Node.js | v20.20.0 (detected environment) | No explicit version constraint in `package.json` or `.nvmrc`; implicit floor of Node.js 15+ from `package-lock.json` lockfileVersion 3 (requires npm v7+) | JavaScript runtime executing `server.js` |
| npm | v11.1.0 (detected environment) | Implicit v7+ requirement from `package-lock.json` lockfileVersion 3 | Package manager for manifest parsing and install verification |

**External / Third-Party Packages**: None. The complete absence of external packages is verified by:
- `package.json`: Contains no `dependencies` or `devDependencies` fields
- `package-lock.json`: Contains only the root project entry with no transitive dependency tree
- `server.js`: Imports only the built-in `http` module via `require('http')`

### 0.3.2 Dependency Updates

No dependency updates are applicable. The project has no external packages to update, add, or remove.

**Import Updates**: Not applicable. The only import statement in the entire codebase is:
```javascript
const http = require('http');
```
This imports the Node.js built-in `http` module and requires no modification.

**External Reference Updates**: Not applicable. No configuration files, documentation, build files, or CI/CD pipelines reference external packages or require import path changes.

**Package Manifest Status**: The `package.json` and `package-lock.json` files are internally consistent in their declaration of zero external dependencies. The `package-lock.json` lockfileVersion 3 format is current and does not require migration.

## 0.4 Integration Analysis

### 0.4.1 Existing Code Touchpoints

The integration surface of this project is intentionally minimal, consisting of a single runtime file and passive filesystem artifacts consumed by external systems.

**Direct Modifications Required**

| File | Location | Integration Action |
|------|----------|-------------------|
| `server.js` | Lines 1–14 (entire file) | No modifications required — the catch-all HTTP handler at lines 6–10 implements the complete server behavior. The `hostname` and `port` constants at lines 3–4 configure binding to `127.0.0.1:3000`. |
| `package.json` | Lines 1–11 (entire file) | No modifications required — the manifest metadata (`hello_world@1.0.0`, author, license) and the intentional `main: "index.js"` discrepancy must be preserved for Backprop analysis. |
| `README.md` | Lines 1–2 (entire file) | No modifications required — the project identity and immutability directive must remain intact. |

**Backprop Integration Touchpoints**

Backprop integrates with this repository through filesystem-level analysis, not runtime API calls. The following touchpoints are relevant:

- **Source Code Analysis**: Backprop reads and parses `server.js` to analyze the Node.js HTTP server implementation, evaluating code structure, module usage, and the `http.createServer()` pattern
- **Manifest Analysis**: Backprop reads `package.json` and `package-lock.json` to perform dependency tree analysis, manifest consistency checks (detecting the `main: "index.js"` discrepancy), and lockfile version validation
- **Multi-Format File Processing**: Backprop enumerates and processes all 9 root-level files across 7+ formats (`.js`, `.java`, `.csv`, `.json`, `.md`, `.txt`) to validate heterogeneous file-type handling
- **Blitzy Ignore System Marker Detection**: The `*.blitzyignore.txt` files (`test.blitzyignore.txt`, `test1.blitzyignore.txt`) serve as integration markers for the Blitzy ignore pattern recognition system

**Dependency Injection Points**: None. The project uses no dependency injection framework, service container, or inversion-of-control pattern. The `http` module is imported directly via CommonJS `require()`.

**Database/Schema Updates**: None. The application is entirely stateless with no database, ORM, migration system, or persistent storage of any kind.

**Middleware/Interceptor Chain**: None. The `http.createServer()` callback directly handles all requests without any middleware pipeline, authentication layer, or request processing chain.

**External Service Connections**: None. The server makes no outbound HTTP requests, webhook calls, or connections to external APIs, message queues, or cloud services. All integration is passive — external tools (Backprop) read the repository; the repository does not call external tools.

## 0.5 Technical Implementation

### 0.5.1 File-by-File Execution Plan

Given the project's minimal scope and immutability directive, the implementation plan focuses on preserving the existing file inventory in its current state. Every file listed below has been evaluated for its role in the Backprop integration feature.

**Group 1 — Core Runtime File (PRESERVE)**

- **PRESERVE: `server.js`** — Maintain the 14-line Node.js HTTP server as-is. This file is the primary Backprop analysis target, implementing the complete runtime behavior: `http.createServer()` with a catch-all handler responding `200 OK`, `text/plain`, `"Hello, World!\n"` on `127.0.0.1:3000`. No modifications needed.

**Group 2 — Package Metadata Files (PRESERVE)**

- **PRESERVE: `package.json`** — Maintain the npm manifest with all current fields intact: `name: "hello_world"`, `version: "1.0.0"`, `main: "index.js"` (intentional discrepancy), `author: "hxu"`, `license: "MIT"`, and the default test script placeholder. The absence of `dependencies` and `devDependencies` is a critical feature, not an omission.
- **PRESERVE: `package-lock.json`** — Maintain the lockfile at version 3 with only the root project entry. This file verifies the zero-dependency state for Backprop's dependency analysis.

**Group 3 — Documentation (PRESERVE)**

- **PRESERVE: `README.md`** — Maintain the two-line file containing the project name ("hao-backprop-test") and the immutability directive ("test project for backprop integration. Do not touch!").

**Group 4 — Multi-Format Test Artifacts (PRESERVE)**

- **PRESERVE: `LoginTest.java`** — Maintain the non-compilable Java skeleton declaring `com.blitzyTest` package with the invalid `Web` token. Serves as a multi-language parsing test for Backprop.
- **PRESERVE: `industry.csv`** — Maintain the 43-entry industry category CSV file with its `Industry` header column. Serves as a structured data parsing test.
- **PRESERVE: `test.blitzyignore.txt`** — Maintain the 0-byte marker file for Blitzy ignore pattern recognition testing.
- **PRESERVE: `test1.blitzyignore.txt`** — Maintain the 0-byte marker file for Blitzy ignore pattern recognition testing.
- **PRESERVE: `test.py.txt`** — Maintain the 0-byte double-extension placeholder for file-type classification edge-case testing.

### 0.5.2 Implementation Approach per File

The implementation approach for this test fixture is governed by the principle of **preservation over modification**. The feature is already implemented in its current state — the repository's value lies in its stable, deterministic nature as a Backprop test target.

- **Establish feature foundation**: The `server.js` file already implements the complete HTTP server feature using only the Node.js built-in `http` module. The server's catch-all handler pattern, hardcoded response, and localhost binding together constitute the minimal-surface runtime that Backprop requires for analysis.
- **Maintain integration surface**: The `package.json` and `package-lock.json` files define the zero-dependency metadata layer that Backprop uses for manifest and dependency tree analysis. The intentional `main: "index.js"` discrepancy provides an edge-case test for manifest-versus-filesystem consistency checking.
- **Preserve test artifact diversity**: The 6 supplementary files spanning Java source, CSV data, and empty marker files ensure Backprop can validate its multi-format file processing capabilities against a known, controlled set of inputs.
- **Respect the immutability contract**: The `README.md` directive ("Do not touch!") establishes the governing constraint for all implementation decisions. Changes are additive-only and limited to what is strictly necessary.

### 0.5.3 User Interface Design

Not applicable. This project is a headless Node.js HTTP server with no user interface, frontend framework, or visual components. The sole interaction model is HTTP request/response via the command line or HTTP client tools (e.g., `curl`, browser). No Figma URLs or UI designs were provided by the user.

## 0.6 Scope Boundaries

### 0.6.1 Exhaustively In Scope

The following files and patterns constitute the complete scope of the Backprop integration test fixture feature. Every file at the repository root is in scope as either a runtime component or a test artifact.

**Runtime Source Files**
- `server.js` — Core Node.js HTTP server (sole executable source file)

**Package Metadata**
- `package.json` — npm manifest with project identity, metadata, and zero-dependency declaration
- `package-lock.json` — Lockfile version 3 confirming zero external dependencies

**Documentation**
- `README.md` — Project identity and immutability directive

**Multi-Format Test Artifacts**
- `LoginTest.java` — Java source artifact (non-compilable, `com.blitzyTest` package)
- `industry.csv` — Structured CSV data artifact (43 industry categories)

**Blitzy Integration Markers**
- `test.blitzyignore.txt` — Blitzy ignore pattern marker (0 bytes)
- `test1.blitzyignore.txt` — Blitzy ignore pattern marker (0 bytes)
- `test.py.txt` — File extension edge-case marker (0 bytes)

**Integration Touchpoints**
- `server.js` (lines 6–10) — Catch-all HTTP request handler (Backprop code analysis target)
- `package.json` (field `main`) — Manifest discrepancy with non-existent `index.js` (Backprop manifest analysis edge case)
- `package-lock.json` (field `packages`) — Zero-dependency tree (Backprop dependency analysis target)

### 0.6.2 Explicitly Out of Scope

The following elements are explicitly excluded from this feature implementation:

- **New npm Dependencies**: Adding any external packages to `package.json` would break the zero-dependency baseline that is critical to the project's test fixture purpose
- **Production Deployment Configuration**: No Dockerfile, docker-compose, Kubernetes manifests, or cloud deployment configurations — the project is localhost-only
- **CI/CD Pipeline Setup**: No `.github/workflows/`, `.gitlab-ci.yml`, or `Jenkinsfile` — CI/CD is listed as a future consideration, not a current requirement
- **Automated Test Suite**: No Jest, Mocha, or other test framework integration — the `package.json` test script remains at the default npm placeholder
- **Authentication or Authorization**: No user authentication, session management, API keys, or access control mechanisms
- **Database or Persistence Layer**: No database, ORM, migration scripts, or any form of state management
- **API Routing or Middleware**: No Express, Koa, Fastify, or other HTTP framework — the built-in `http` module is used directly
- **Frontend or UI Components**: No HTML, CSS, React, Angular, Vue, or any visual interface
- **Performance Optimization**: No clustering, load balancing, caching, or scaling infrastructure
- **Refactoring of Existing Code**: No modifications to the existing 14-line `server.js` or any other file unless explicitly required for feature integration
- **Binary Test Artifacts Management**: Binary files referenced in the tech spec (`100Pages.pdf`, `demo.jpg`, `sample.doc`) are not present in the current working repository and are not part of this implementation scope

## 0.7 Rules for Feature Addition

The following rules govern all feature additions and modifications to the hao-backprop-test repository, derived from the user's instructions, `README.md` directives, and the project's architectural constraints.

**Immutability Rule**
- The `README.md` directive ("Do not touch!") establishes that the repository must remain in a stable, controlled state. Any modifications must be minimal, additive, and must not alter the behavior or content of existing files unless strictly necessary for the feature.

**Zero-Dependency Rule**
- No external npm packages may be added to `package.json`. The project's zero-dependency baseline is a core feature (F-003), not a limitation. The only permitted module import is the Node.js built-in `http` module.

**Localhost-Only Binding Rule**
- The server must continue to bind exclusively to `127.0.0.1` (not `0.0.0.0` or any other interface). This constraint prevents external network exposure and is a deliberate security decision for a test fixture.

**Test Fixture Integrity Rule**
- All existing test artifacts (`LoginTest.java`, `industry.csv`, `test.blitzyignore.txt`, `test1.blitzyignore.txt`, `test.py.txt`) must be preserved in their exact current state. These files serve as known-good inputs for Backprop's multi-format analysis capabilities.

**Non-Production Use Rule**
- The user has explicitly stated this project is "not meant for production use." Implementation decisions must prioritize simplicity and deterministic behavior for testing over production-grade patterns such as error handling frameworks, logging libraries, or monitoring instrumentation.

**Manifest Discrepancy Preservation Rule**
- The `package.json` field `"main": "index.js"` must remain unchanged despite `index.js` not existing. This intentional discrepancy serves as an edge-case test for Backprop's manifest-versus-filesystem consistency analysis.

**Flat Structure Convention**
- The repository uses a flat directory structure with all files at the root level. New files, if introduced, should follow this convention unless the feature explicitly requires subdirectory organization.

**CommonJS Module Convention**
- The project uses CommonJS syntax (`require()`). Any new JavaScript code must follow this convention rather than ES Module `import` syntax, maintaining consistency with the existing `server.js`.

## 0.8 References

**Repository Files and Folders Searched**

The following files and folders were systematically searched and analyzed to derive the conclusions documented in this Agent Action Plan:

| Path | Type | Purpose of Search |
|------|------|-------------------|
| `/` (repository root) | Folder | Enumerate all files and confirm flat directory structure — 9 files, 0 subdirectories |
| `server.js` | File | Analyze the core HTTP server implementation — 14 lines using Node.js built-in `http` module |
| `package.json` | File | Review npm manifest metadata, dependency declarations, and project configuration |
| `package-lock.json` | File | Verify lockfileVersion 3 and confirm zero external dependencies |
| `README.md` | File | Extract project identity ("hao-backprop-test") and immutability directive ("Do not touch!") |
| `LoginTest.java` | File | Assess Java test artifact — non-compilable skeleton with `com.blitzyTest` package declaration |
| `industry.csv` | File | Review structured data artifact — 43 industry categories in single-column CSV format |
| `test.blitzyignore.txt` | File | Confirm 0-byte Blitzy ignore marker file |
| `test1.blitzyignore.txt` | File | Confirm 0-byte Blitzy ignore marker file |
| `test.py.txt` | File | Confirm 0-byte double-extension edge-case marker file |

**Technical Specification Sections Referenced**

| Section | Content Retrieved |
|---------|-------------------|
| 1.1 Executive Summary | Project overview, core problem being solved, stakeholders, and business impact |
| 1.3 Scope | In-scope file inventory, out-of-scope exclusions, and integration boundaries |
| 2.1 Feature Catalog | Feature definitions for F-001 (HTTP Server), F-002 (Multi-Format Artifacts), F-003 (Zero-Dependency Baseline) |
| 2.2 Functional Requirements | Detailed requirements for each feature including acceptance criteria and validation rules |
| 3.2 Programming Languages | JavaScript/Node.js as primary language, CommonJS module system, version constraints |
| 3.3 Frameworks & Libraries | Confirmation of zero-framework architecture and justification |
| 5.1 High-Level Architecture | Monolithic single-file architecture, system boundaries, data flow, and integration points |
| 5.2 Component Details | HTTP server component, package metadata component, and test artifact component details |

**User-Provided Attachments**

No attachments were provided for this project. The `/tmp/environments_files` directory does not exist.

**Figma Screens**

No Figma URLs or UI design screens were provided. This project has no user interface component.

**Environment Variables and Secrets**

No environment variables or secrets were provided by the user.

