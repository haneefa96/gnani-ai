# PROJECT SETUP — DOCUMENTATION AND DEVELOPMENT PLANNING

## Instructions for the AI Coding Agent

Act as a Senior Software Architect, Technical Project Manager, Full-Stack Developer, and QA Engineer.

The project explanation is available in the root folder as:

`01_Saakshi_Project_Document.pdf`

This PDF is the primary source of truth. Read and analyse the entire document before making any implementation decisions.

## PHASE 1 — UNDERSTAND THE PROJECT

Read all 14 pages of the PDF, including tables, diagrams, architecture, technical specifications, work distribution, timelines, risks, and testing requirements.

Understand and document:

- Project overview and problem statement.
- Objectives and proposed solution.
- All user roles and workflows.
- Complete MVP and advanced features.
- Functional and non-functional requirements.
- Technology stack.
- Gnani STT and TTS integration requirements.
- Database design and state machine.
- API contracts.
- Hash-chain and evidence-pack requirements.
- Security, privacy, and ethical requirements.
- Two-developer work distribution.
- Testing and evaluation strategy.
- Project risks and final demo requirements.

Do not skip any requirement.

## PHASE 2 — INSPECT THE EXISTING PROJECT

Inspect the complete project directory before making changes.

Identify:
- Existing files and folders.
- Existing technology stack.
- Implemented functionality.
- Incomplete functionality.
- Missing functionality.
- Existing database and APIs.
- Existing tests.
- Existing integrations.
- Technical issues and risks.

Preserve existing working code and data. Do not unnecessarily replace existing implementations.

Clearly distinguish between existing functionality and planned functionality.

## PHASE 3 — CREATE PROJECT DOCUMENTATION

Create or update the following files in the project root:

1. README.md
   - Project introduction.
   - Features.
   - Technology stack.
   - Installation and execution.
   - Setup and environment variables.
   - Testing instructions.

2. PROJECT_REQUIREMENTS.md
   - All requirements from the PDF.
   - Unique requirement IDs.
   - MVP versus advanced scope.
   - Acceptance criteria.

3. SYSTEM_ARCHITECTURE.md
   - Overall architecture.
   - Frontend and backend components.
   - Gnani integration.
   - Data flow.
   - Mermaid architecture diagrams.

4. DATABASE_DESIGN.md
   - Tables, fields, relationships.
   - State machine.
   - Hash-chain design.
   - ER diagram.

5. API_DOCUMENTATION.md
   - All specified endpoints.
   - Request and response contracts.
   - WebSocket contract.
   - Error handling.

6. WORK_BREAKDOWN.md
   - Developer A and Developer B ownership.
   - Independent implementation chunks.
   - Dependencies.
   - Parallel tasks.
   - Integration checkpoints.
   - Timeline and estimates.

7. IMPLEMENTATION_TRACKER.md
   - Chunk status.
   - Requirements completed.
   - Tests passed and failed.
   - Verification status.
   - Blockers.

8. TESTING_STRATEGY.md
   - Unit tests.
   - Integration tests.
   - Gnani smoke tests.
   - Audio accuracy evaluation.
   - API contract tests.
   - End-to-end tests.

9. DECISIONS_AND_ASSUMPTIONS.md
   - Open questions.
   - Technical decisions.
   - Assumptions.
   - Risks requiring verification.

10. DEVELOPMENT_GUIDELINES.md
    - Folder ownership.
    - Git workflow.
    - Coding standards.
    - Branching and pull requests.
    - Rules to prevent merge conflicts.

Update existing documentation instead of creating duplicates. Additional files may be created when genuinely useful.

## PHASE 4 — WORK DISTRIBUTION

Follow the ownership and work distribution specified in the PDF.

Developer A owns:
- Gnani STT and TTS.
- Audio recording and streaming.
- Voice extraction.
- Read-back and language normalisation.
- Voice frontend components.
- Contractor voice confirmation UI.
- FakeVoice and voice evaluation.

Developer B owns:
- Backend application.
- Database and migrations.
- Authentication and onboarding.
- Entry ledger and state machine.
- Hash chain.
- Share-token APIs.
- Evidence PDF and audio ZIP.
- Main frontend screens.
- CI, tooling, and deployment.

Shared work:
- API contracts.
- JSON schemas.
- Voice interface.
- Integration checkpoints.
- End-to-end testing.

Respect the file ownership map and conflict-prevention rules in the PDF.

Break each developer's responsibilities into small, independently implementable chunks.

For every chunk specify:
- ID.
- Objective.
- Assigned developer.
- Files involved.
- Requirements covered.
- Dependencies.
- Implementation steps.
- Expected result.
- Verification procedure.
- Acceptance criteria.
- Estimated effort.

Identify tasks that can be performed simultaneously and those requiring sequential execution.

## PHASE 5 — VERIFICATION PLAN

Every chunk must have its own verification criteria.

Include actual execution of relevant tests.

Important project-specific checkpoints:

Checkpoint 1:
Real Hindi/Kannada/English speech produces transcripts in the application UI.

Checkpoint 2:
Worker records an entry, hears the TTS read-back, confirms it, and sees a valid hash-chained history entry.

Checkpoint 3:
Contractor confirmation/dispute and evidence-pack generation work end to end.

Final:
Complete workflow, verification endpoint, privacy controls, regression tests, and demo readiness.

Do not mark any chunk complete just because code exists.

## STRICT RULES

1. The PDF is the primary source of truth.
2. Do not silently skip requirements.
3. Do not add unnecessary features.
4. Do not change the prescribed technology stack without justification.
5. Do not overwrite working code.
6. Do not expose API keys or secrets.
7. Do not claim a real integration works based only on successful imports.
8. Distinguish real, mocked, and hardcoded functionality.
9. Do not claim tests passed unless executed.
10. Update documentation and implementation tracker continuously.
11. Explain technical decisions in beginner-friendly language.
12. Do not begin the next implementation chunk until the current one passes verification.

## FIRST MILESTONE — DOCUMENTATION ONLY

For now, complete only:

1. Read and understand the entire PDF.
2. Inspect the existing project.
3. Create/update all necessary documentation.
4. Extract all requirements.
5. Prepare the architecture.
6. Create the two-developer work breakdown.
7. Define independent chunks and dependencies.
8. Establish verification criteria.

Do not implement application features or modify existing application logic during this milestone.

At the end, report:

- PDF reviewed and pages covered.
- Project understanding.
- Documentation files created/updated.
- Complete requirements checklist.
- Architecture overview.
- Developer A and B work distribution.
- Independent implementation chunks.
- Dependency graph.
- Testing and verification plan.
- Open questions and risks.
- Existing project status.

STOP and wait for my approval before starting implementation.