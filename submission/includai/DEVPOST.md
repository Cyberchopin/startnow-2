# Start Now — IncludAI Devpost Submission

> Submission target: Track 1 — AI for Learners Who Think Differently

## Project name

Start Now

## One-line pitch

An AI Body Double that turns activation paralysis into one honest 60-second start.

## Project links

- Live prototype: https://startnow-2.vercel.app
- Public source: https://github.com/Cyberchopin/startnow-2
- Demo video: `[ADD PUBLIC YOUTUBE OR VIMEO URL]`

## Inspiration

Most productivity tools begin after a learner has already started: they organize assignments, generate study plans, and optimize schedules. But for many neurodivergent learners, the hardest moment comes earlier. The assignment is open in another tab, the deadline matters, and the learner still cannot make the first physical move.

Start Now focuses on that activation gap. It does not ask the learner to become more organized. It adapts the first action to the learner's current energy, overwhelm, and barrier, then stays beside them long enough to create one visible trace of progress.

## What it does

The learner chooses a school assignment, personal project, or application and completes a ten-second check-in:

- How much energy is available?
- How overwhelming does the task feel?
- What is blocking the start: uncertainty, scope, fear, boredom, or exhaustion?

Gemini converts that compact state into exactly one safe, reversible physical action that can begin within 60 seconds. The response is not a plan or lecture. It might be: “Open the assignment and write one deliberately rough answer fragment.”

If that action is still too large, the learner can shrink it again. An optional Gemini-powered voice Body Double offers a calm prompt while a 60-second room removes the pressure to finish. Progress counts only after the learner names the specific action their hands actually took. Start Now then saves the exact re-entry point, so the next session begins at the edge of progress instead of rebuilding the plan.

## Meaningful use of AI

Gemini 3.6 Flash is the activation reasoner. It receives only the task text and a compact check-in state, then returns structured fields for:

- one executable mission;
- the reason it matches the stated barrier;
- one Body Double coaching cue; and
- the intervention strategy used.

The output must pass a strict schema and safety validation. Instructions that become plans, irreversible actions, purchases, submissions, or unsafe requests are rejected. If Gemini is unavailable or returns invalid output, a deterministic intervention engine produces a safe fallback. Gemini 3.1 TTS provides optional voice support with three low-stimulation personas and a browser speech fallback.

## Designed with real users

Three adult external testers completed the product flow during the hackathon, in addition to the builder's own repeated use. One participant was an adult with dyslexia. Participants are described only in anonymous aggregate terms; the study does not collect names or diagnosis details.

Participants can submit one anonymous, consented response without names, contact information, school information, links, or diagnosis details. Raw feedback is visible only in an owner-authenticated Research Console. Each response can be classified and tied to a “User said → We changed → Why” decision.

The first traceable decision came from feedback that the action prompt was useful but the default voice still felt robotic. Instead of treating voice as cosmetic, the project now tracks a planned voice-preview comparison across Warm, Friendly, and Soft personas because emotional comfort is part of whether a Body Double intervention works.

One adult participant with dyslexia told us that recovery matters more than perfection: restarting work after missing a day should itself be treated as progress. We turned that insight into a visible recovery moment. When a learner returns after a gap and completes one honest start, Start Now explicitly recognizes the comeback, increments Recoveries, and avoids framing a broken perfect streak as failure.

## Accessibility and safety

- Low-stimulation dark interface with reduced-motion support
- Keyboard-usable controls and explicit selected states
- A “shrink again” escape hatch at every high-friction moment
- No diagnosis, shame, social comparison, or punitive streak loss
- Personal activation history remains on the learner's device
- Gemini interaction storage is disabled
- Raw research feedback is never exposed publicly
- The research form is limited to consenting adults 18+; the learning experience itself does not require an account or collect identity
- Start Now is an experimental prototype, not a medical device or substitute for professional care

## How we built it

- Next.js-compatible React and TypeScript interface
- Gemini 3.6 Flash structured mission reasoning
- Gemini 3.1 Flash TTS preview voices
- Deterministic safe fallback engine
- Local-first journey and activation history
- Upstash Redis REST for anonymous study evidence and decision logs on Vercel
- Signed HttpOnly owner session for the protected Research Console
- Automated validation for AI output, Vercel builds, Redis persistence, owner-auth spoofing, and voice output

## Challenges

The hardest design problem was resisting the urge to generate more advice. A capable model can easily produce a polished five-step plan, but a plan is exactly what an overwhelmed learner may be unable to use. We constrained the model to one reversible physical action and built a deterministic fallback so the core intervention still works during an outage.

The second challenge was honest evidence. Public metrics are easy to fake and raw feedback is unsafe to expose. Start Now separates anonymous public aggregates from a private research console and makes product decisions traceable to consented responses.

## Accomplishments

- A complete check-in → AI mission → shrink → Body Double → proof → re-entry loop
- Meaningful AI use with structured validation and an explainable fallback
- A school-assignment pathway aligned to neurodivergent task initiation
- Private, persistent user-research infrastructure rather than invented traction
- A product-decision log that turns feedback into accountable changes
- A deployed prototype that works without sign-up

## What we learned

Activation is not a smaller version of planning. The right unit of help is often not “finish question one,” but “open the assignment and point to the first unfinished instruction.” We also learned that recovery must be designed, not merely permitted: a learner who returns after a missed day needs evidence that coming back counts. Finally, delivery changes the intervention—users can agree with the words while still disengaging from a voice that feels synthetic.

## What's next

The next evidence gate is 5–10 consented adult neurodivergent usability sessions, followed by three feedback-linked product decisions. We will compare voice personas, measure time-to-action and scope reductions, and test whether returning to a saved re-entry point reduces the cost of beginning again.
