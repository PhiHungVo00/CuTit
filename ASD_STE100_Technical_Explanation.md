# Technical Explanation Document: Agentic Vietnamese Learning Platform
**Specification Standard:** ASD-STE100 (Simplified Technical English)  
**Document Number:** TED-UIT-SE405-001  
**Issue Date:** 2026-10-04  
**Status:** Approved Draft  

---

## 1. General Information and Scope

### 1.1 Purpose
This document explains the technical architecture of the Vietnamese Learning Platform. It describes the system components, the communication rules, and the integration of the 23 Gang of Four (GoF) design patterns.

### 1.2 Target Audience
Developers, system architects, and technical reviewers must read this document.

### 1.3 System Overview
The system is an interactive educational application. The software teaches the Vietnamese language to foreign learners and business professionals. 

The software contains three primary capabilities:
- Real-time speech analysis for six Vietnamese lexical tones.
- Conversational artificial intelligence (AI) with dynamic user interface (UI) blocks.
- Real-world cultural scenarios with the "Cu Tít" guide character.

---

## 2. System Architecture

### 2.1 High-Level Architecture
The platform uses a single code repository. It runs on web browsers and mobile devices.

The system contains three primary layers:
1. **Client Layer:** A host application coordinates six remote micro frontend modules.
2. **Gateway Layer:** A stateless server processes requests and manages external service access.
3. **Data and Service Layer:** Databases store user data and cloud providers supply artificial intelligence services.

```
+---------------------------------------------------------------+
|                       CLIENT BROWSER                          |
|  +---------------------------------------------------------+  |
|  |                       Host Shell                        |  |
|  +---------------------------------------------------------+  |
|     |            |            |           |            |      |
|  +------+    +-------+    +-------+   +-------+    +-------+  |
|  | Conv |    | Pract |    | Learn |   | Pitch |    | Visual|  |
|  +------+    +-------+    +-------+   +-------+    +-------+  |
+---------------------------------------------------------------+
                               |
                               | HTTPS / Server-Sent Events
                               v
+---------------------------------------------------------------+
|                        SAAS GATEWAY                           |
|  - Authenticate User         - Verify Token Quota             |
|  - Validate Zod Schema       - Orchestrate Service Adapters   |
+---------------------------------------------------------------+
                               |
                               v
+---------------------------------------------------------------+
|                     THIRD-PARTY AI APIS                       |
|   Speech-to-Text  |  Text-to-Speech  |  Large Language Model  |
+---------------------------------------------------------------+
```

### 2.2 Client Layer (Micro Frontend)
The frontend uses module federation. The host shell controls:
- Application routing.
- User session authentication.
- Shared user interface tokens.
- The event bus.
- The dynamic component registry.

The host shell loads six independent remote modules:
1. `mfe-conversation`: Provides chat screens and roleplay scenarios.
2. `mfe-practice`: Provides adaptive drill cards and sentence building exercises.
3. `mfe-learner`: Provides onboarding tests, user preferences, and spaced repetition analytics.
4. `mfe-speech-lab`: Provides pitch visualizers and dialect comparison tools.
5. `mfe-vision`: Provides camera recognition with augmented reality labels.
6. `mfe-knowledge`: Provides social title matrices and cultural guides.

> [!CAUTION]
> Remote modules must not import code directly from other remote modules. All cross-module communication must use the typed event bus or route navigation.

### 2.3 Gateway Layer (SaaS Gateway)
The gateway runs on Node.js and TypeScript. The gateway does not store state.

The gateway pipeline performs these tasks in strict order:
1. Receive request with identification token.
2. Verify user permissions.
3. Verify rate limits and usage quota.
4. Validate payload with schema definitions.
5. Forward data to cloud provider adapters.
6. Format response data.
7. Return normalized JSON or event streams to the client.

> [!CAUTION]
> Do not store API secret keys in the client code. The server must hold all third-party credentials.

---

## 3. Integration of 23 GoF Design Patterns

The architecture implements all 23 Gang of Four design patterns to maintain code quality, system stability, and modularity.

### 3.1 Creational Patterns (5 Patterns)

#### 1. Abstract Factory
- **Location:** `apps/gateway/src/providers/`
- **Function:** Creates families of compatible artificial intelligence service adapters (STT, TTS, and LLM) based on runtime configuration.

#### 2. Factory Method
- **Location:** `packages/shared/src/drills/`
- **Function:** Instantiates specific exercise card models (multiple-choice cards, fill-in-blank cards, or sentence-reorder cards) from drill type keys.

#### 3. Builder
- **Location:** `packages/prompts/src/builders/`
- **Function:** Constructs complex prompts for language models by assembling learner proficiency, target dialect, roleplay situation, and error history.

#### 4. Singleton
- **Location:** `apps/host-shell/src/bus/` and `apps/gateway/src/db/`
- **Function:** Ensures that only one event bus instance exists in the client and only one connection pool connects to the database.

#### 5. Prototype
- **Location:** `packages/content/src/scenarios/`
- **Function:** Clones default roleplay scenarios to create custom practice sessions for learners without database queries.

---

### 3.2 Structural Patterns (7 Patterns)

#### 6. Adapter
- **Location:** `apps/gateway/src/adapters/`
- **Function:** Converts external provider interfaces (Azure Speech, Google Cloud, Vbee) into standard system interfaces (`SttProvider`, `TtsProvider`).

#### 7. Facade
- **Location:** `apps/gateway/src/routes/chat.ts`
- **Function:** Combines speech recognition, language model streaming, tone assessment, and audio synthesis into one simple `/v1/chat/turn` endpoint.

#### 8. Composite
- **Location:** `apps/host-shell/src/components/AgentUI/`
- **Function:** Renders trees of interactive UI blocks. An agent message container holds card blocks, audio blocks, and button blocks as single uniform elements.

#### 9. Decorator
- **Location:** `apps/gateway/src/middleware/`
- **Function:** Dynamically adds authentication verification, quota calculation, cost measurement, and performance logging to route handlers.

#### 10. Bridge
- **Location:** `packages/audio-dsp/src/audio/`
- **Function:** Separates high-level audio recording logic from platform-specific audio recording implementations (Standard Web Audio API versus Capacitor Native Plugin).

#### 11. Proxy
- **Location:** `apps/gateway/src/cache/`
- **Function:** Intercepts speech synthesis requests. The proxy retrieves cached audio files from storage before calling paid external APIs.

#### 12. Flyweight
- **Location:** `packages/content/src/pitch/`
- **Function:** Shares immutable pitch reference contours and native speaker voice samples among thousands of active learner sessions.

---

### 3.3 Behavioral Patterns (11 Patterns)

#### 13. Strategy
- **Location:** `packages/audio-dsp/src/pitch/`
- **Function:** Selects the fundamental frequency (F0) extraction algorithm at runtime. The system uses the YIN algorithm or the McLeod algorithm depending on client hardware capacity.

#### 14. Observer
- **Location:** `apps/host-shell/src/bus/EventBus.ts`
- **Function:** Notifies remote modules when core events occur (e.g., `session.started`, `attempt.completed`, `agent.ui.action`).

#### 15. Chain of Responsibility
- **Location:** `apps/gateway/src/services/grammar/`
- **Function:** Validates sentence order through sequential steps: dictionary lookup, rule validation table, and language model evaluation.

#### 16. Command
- **Location:** `apps/host-shell/src/actions/`
- **Function:** Encapsulates user interactions on UI blocks into command objects. The client logs, queues, and retries these commands during network disconnects.

#### 17. State
- **Location:** `apps/mfe-conversation/src/state/`
- **Function:** Controls conversation turn lifecycles (`IDLE` -> `RECORDING` -> `ANALYZING` -> `STREAMING` -> `PLAYING`).

#### 18. Template Method
- **Location:** `apps/gateway/src/services/assessment/`
- **Function:** Defines the fixed sequence for pronunciation grading: normalize text with NFC, calculate word differences, compare acoustic contours, and generate suggestions.

#### 19. Mediator
- **Location:** `apps/host-shell/src/mediator/`
- **Function:** Coordinates data exchange between independent remote modules so remotes remain completely decoupled.

#### 20. Iterator
- **Location:** `packages/shared/src/srs/`
- **Function:** Traverses spaced repetition cards that are due for review based on the SM-2 algorithm schedule.

#### 21. Interpreter
- **Location:** `packages/content/src/honorifics/`
- **Function:** Evaluates social relationship formulas (Age + Gender + Kinship + Formality Level) to determine the correct Vietnamese pronoun pair.

#### 22. Visitor
- **Location:** `apps/host-shell/src/protocol/`
- **Function:** Traverses agent message block structures to sanitize HTML content, check security policies, and collect usage analytics without modifying block classes.

#### 23. Memento
- **Location:** `apps/mfe-practice/src/sentence/`
- **Function:** Captures snapshots of word arrangement tokens, allowing learners to undo actions in the sentence building interface.

---

## 4. Technical Rules and Specifications

### 4.1 Audio Processing Specifications
- Audio sample rate must be 16,000 Hertz.
- Audio channels must be mono (one channel).
- Pitch analysis runs inside a dedicated Web Worker.
- Audio frames must use 16-bit uncompressed PCM data.

### 4.2 Text Normalization Rules
- All Vietnamese text strings must use Unicode Normalization Form C (NFC).
- The system must reject unnormalized strings to prevent accent mark comparison failures.

### 4.3 Agent UI Protocol Rules
- The language model must return JSON data only.
- The language model must not return raw HTML strings.
- The gateway validates all JSON payloads against Zod schemas before delivery.
- Maximum allowed blocks per agent message turn: 4 blocks.

---

## 5. Summary Table: Pattern and Module Mapping

| Pattern | Category | Primary Module | Core Function |
| :--- | :--- | :--- | :--- |
| **Abstract Factory** | Creational | `apps/gateway` | Selects AI provider family |
| **Factory Method** | Creational | `packages/shared` | Creates exercise card types |
| **Builder** | Creational | `packages/prompts` | Assembles multi-layer prompts |
| **Singleton** | Creational | `apps/host-shell` | Guarantees single event bus |
| **Prototype** | Creational | `packages/content` | Clones scenario templates |
| **Adapter** | Structural | `apps/gateway` | Standardizes cloud APIs |
| **Facade** | Structural | `apps/gateway` | Unifies multi-model chat turn |
| **Composite** | Structural | `apps/host-shell` | Manages hierarchical UI blocks |
| **Decorator** | Structural | `apps/gateway` | Adds quota and auth checks |
| **Bridge** | Structural | `packages/audio-dsp` | Separates audio from OS platform |
| **Proxy** | Structural | `apps/gateway` | Controls cache and limits |
| **Flyweight** | Structural | `packages/content` | Shares common F0 contours |
| **Strategy** | Behavioral | `packages/audio-dsp` | Switches F0 algorithm |
| **Observer** | Behavioral | `apps/host-shell` | Distributes system events |
| **Chain of Resp.** | Behavioral | `apps/gateway` | Chains grammar review steps |
| **Command** | Behavioral | `apps/host-shell` | Encapsulates UI block events |
| **State** | Behavioral | `apps/mfe-conversation` | Controls turn state machine |
| **Template Method** | Behavioral | `apps/gateway` | Standardizes grading workflow |
| **Mediator** | Behavioral | `apps/host-shell` | Coordinates remote modules |
| **Iterator** | Behavioral | `packages/shared` | Steps through review cards |
| **Interpreter** | Behavioral | `packages/content` | Evaluates honorific rules |
| **Visitor** | Behavioral | `apps/host-shell` | Sanitizes block element trees |
| **Memento** | Behavioral | `apps/mfe-practice` | Preserves token layout states |
