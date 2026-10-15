# Redesign report

## Audit and improvements

| Problem | Change |
| --- | --- |
| Hero described working translation and speech as unwired | Purpose-led headline, accurate three-step onboarding and Start action |
| Large gaps separated conversation and controls | Compact paired participants; transcript beside sticky composer on desktop, stacked on mobile |
| Interrupt dominated Send | Primary Send inside writing surface; secondary Interrupt with accurate behavior explanation |
| Weak original/translation hierarchy | Speaker-tinted surfaces, original-language labels, separated translation blocks and larger translated text |
| Low-contrast metadata and small controls | Darker secondary text, readable rust accents, 44px control heights, focus styling and skip link |
| Long messages and narrow headings could overflow | Wrapping content, constrained grid tracks and wrapping section controls |
| Empty voice list displayed Checking forever | Separate voice-loading completion from the number of installed voices |
| Offline banner promised automatic retries | Explain connection checking and per-message Retry |
| Enter could send during IME composition | Ignore Enter-to-send while composing |
| Stale phase copy and unrelated favicon | Product-facing session wording and original conversation icon |

## Branding

Reviewed the official [ZERO homepage](https://www.zero4genz.in/) and
[products](https://www.zero4genz.in/products), including the homepage stylesheet.
The stylesheet declares Inter and JetBrains Mono, matching the existing app.
The redesign retains numbered editorial sections, direct language and the existing
paper/lime/purple palette, with orange reserved for events.

No authorized official logo asset was obtained or reused. The header uses ordinary
text, “ZERO / BUILD CHALLENGE,” separate from the product name. Replace it in
Header.tsx when an authorized asset is supplied. The footer explicitly identifies
this as an independent project, not an official ZERO product. The new favicon
represents this conversation app, not ZERO.

## Every changed file

| File | Change |
| --- | --- |
| `src/App.tsx` | Workspace layout, skip target, reduced-motion-aware Start, voice readiness and session/footer wording |
| `src/App.test.tsx` | Empty voice list, IME Enter and Urdu direction regression tests |
| `src/index.css` | Responsive layout, surfaces, controls, contrast and reduced motion |
| `src/hooks/useSpeechSynthesis.ts` | Explicit voice-loading completion |
| `src/components/Hero.tsx` | Headline, onboarding and Start action |
| `src/components/Header.tsx` | Text brand lockup and tab-session wording |
| `src/components/ParticipantPanel.tsx` | Participant surfaces, unique language labels and contrast |
| `src/components/LanguageSelector.tsx` | Label and icon contrast |
| `src/components/MicControl.tsx` | Secondary text contrast |
| `src/components/Composer.tsx` | Action hierarchy, direction, input metadata, focus and IME handling |
| `src/components/Timeline.tsx` | Compact actionable empty state |
| `src/components/MessageItem.tsx` | Message hierarchy, speaker surfaces, wrapping, contrast and fewer redundant announcements |
| `src/components/ConversationStatus.tsx` | Status context contrast |
| `src/components/BackendStatusBanner.tsx` | Accurate recovery guidance and icon contrast |
| `src/components/SectionHeading.tsx` | Narrow-screen wrapping and index contrast |
| `src/components/ConfirmDialog.tsx` | Readable confirmation accents |
| `src/components/DemoPreview.tsx` | Readable explanatory accent |
| `src/components/Toast.tsx` | Readable dismissal hover accent |
| `public/favicon.svg` | Original app-specific conversation icon |
| `index.html` | Corrected product description |
| `README.md` | Current redesign overview and report link |
| `REDESIGN.md` | Audit, research, change inventory and verification |

No dependencies added or changed. No backend, translation-provider, chunking,
language-list or recognition-engine changes. No existing tests removed or weakened.
The production build regenerates ignored `dist/` assets.

## Verification

| Check | Result |
| --- | --- |
| Frontend `npm test` | 79 passed across 10 files |
| Backend `npm test` | 65 passed |
| `npm run lint` | Passed |
| `npm run build` | Frontend TypeScript checks and Vite production build passed |
| Backend `npm run typecheck` | Passed |
| Local Vite HTTP request | HTTP 200 |

The backend runs TypeScript directly and has no separate build script. Existing
tests cover failure/retry, duplicate submission, stale requests, cleanup,
interruption and MyMemory chunking. Speech and translation tests use mocks.

Automatic approval review rejected launching headless Chrome for screenshots with
the reason “blocked by policy.” No desktop/mobile screenshot inspection was
completed. Responsive appearance remains unverified in a real browser.

## Manual browser checks and limitations

1. Run `npm run dev` in the root and in `server/` in separate terminals. Inspect
   the Vite URL at 320, 390, 768 and 1440px, and 200% zoom. Check long messages,
   language controls, section headings and Send for overflow.
2. Navigate by keyboard through the skip link, Start, languages, microphones,
   sender selection and message controls. Verify focus visibility, confirmation
   Escape handling, focus trapping and restoration.
3. Translate English to Spanish and back. Select Arabic and Urdu and check native
   labels and right-to-left rendering. Confirm all 15 choices and try long text.
4. On localhost/HTTPS, grant microphone access, dictate, review, send and listen
   where a matching voice exists. Deny permission once; verify typing still works.
   Try unsupported recognition and a language with no installed output voice.
5. During playback, use Stop and then send a draft with Interrupt. Verify the
   cut-in appears once, speech stops and ending a session clears the conversation.
6. Stop the backend, send a message and verify its original survives. Restart the
   backend, choose Retry and confirm that message updates in place.
7. With a Chinese/Japanese IME, Enter should confirm composition without sending;
   a subsequent Enter sends. Shift+Enter should still add a line.
8. Enable reduced motion and check screen-reader phase announcements without
   repeated interim words. Review a failed message's error and Retry control.

The product remains a shared-device, turn-based tool without multi-device transport
or saved history. Speech availability varies by browser/OS. Actual microphone,
audio playback and external translation were not exercised during this redesign.
