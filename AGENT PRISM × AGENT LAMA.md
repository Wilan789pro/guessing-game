AGENT PRISM × AGENT LAMA
CLASSIFIED DATE INVITATION — MASTER BUILD SPECIFICATION
You are an expert full-stack developer, UI/UX designer, interaction designer, animation designer, and database architect.
You are working inside my VS Code project.
Your job is to BUILD the complete website described below.
Do not give me a tutorial about how to build it.
Do not give me fragments and ask me to assemble them.
Do not leave major functionality as TODOs.
Create the actual working project, including frontend, backend/database integration, authentication, migrations/schema, responsive UI, animations, game logic, persistence, and admin Command Center.
If something can be implemented in code, implement it.
Only ask me for information when it is genuinely impossible for you to proceed without an external credential, such as a Supabase project URL/key. Do not ask me to manually create database tables. Generate the SQL schema/migrations and application code yourself.

1. PROJECT CONCEPT
This is a private-feeling romantic interactive date invitation website for my girlfriend.
The two characters are:

Agent Prism = my girlfriend
Agent Lama = me

The website should feel like a combination of:

spy thriller
classified intelligence terminal
interactive game
cinematic movie trailer
romantic date invitation

It must NOT feel like a generic Valentine's Day website.
The central idea:
Agent Prism receives a classified mission from Agent Lama.
She must accept the mission.
The date itself is scheduled for:
SATURDAY, OCTOBER 3, 2026
Agent Lama will pick up Agent Prism from her residence at:
08:30 AM
The first destination is:
Developers Festival
Lunch happens afterward.
There is then a secret destination.
The secret destination is:
HARRY POTTER ESCAPE ROOM
However, the website must NOT reveal this destination upfront.
The guessing game exists specifically so Agent Prism can try to discover the secret destination.

2. IMPORTANT PRIVACY REQUIREMENT
DO NOT use personal photographs.
There will be NO:

personal photo gallery
girlfriend photo
couple photo
photo placeholders
image upload system
personal image folders

The website will be publicly hosted, so personal photographs must not be included.
The personal feeling should come from:

writing
character identities
mission narrative
inside-joke style interactions
animations
date details
game mechanics
romantic messages

Do not create empty folders or placeholder references for photos.

3. TECH STACK
Use a simple, maintainable architecture.
Preferred stack:
Frontend

HTML
CSS
vanilla JavaScript

Do NOT introduce React/Next.js unless absolutely necessary.
Backend / database
Use:

Supabase
PostgreSQL
Supabase Auth where appropriate

The database is the source of truth.
localStorage may be used as a cache/fallback for UX, but it must NOT replace the database.
The application should attempt to synchronize state with Supabase.
If temporarily offline:

retain local state
queue important events
retry synchronization when connectivity returns

Do not silently lose interaction data.

4. CORE DESIGN PHILOSOPHY
The site should feel premium.
Visual inspiration:

classified intelligence dossiers
spy agency terminals
modern espionage movies
secure computer interfaces
mission control screens
redacted documents
subtle surveillance UI
cinematic title cards

Avoid making it look like generic cyberpunk.
Do NOT overuse:

neon
excessive glowing text
rainbow gradients
futuristic HUD clutter
cheesy hacker graphics

Preferred palette:

black
charcoal
deep red
white
grey
terminal green
subtle gold/cream for romantic moments

Use:

thin borders
dossier panels
glass effects
redactions
scanlines
subtle noise
terminal typing
loading bars
classified stamps
flicker/glitch effects
cinematic transitions

The romantic sections can become warmer and softer without destroying the spy aesthetic.

5. MOBILE-FIRST REQUIREMENT
Agent Prism will primarily use this on her phone.
The website MUST be designed mobile-first.
Requirements:

portrait-first
responsive
full-screen scenes
no horizontal scrolling
large touch targets
touch + mouse support
safe-area support
readable text on small screens
buttons must be easy to tap
no hover-only interactions
keyboard must work on mobile
animations must not make the site unusable

Desktop should still look good.

6. ACCESS / SESSION MODEL
Create a unique mission/session identifier.
The player should be able to:

start the mission
leave the website
return later
continue from where she left off

Do not reset everything simply because the browser is refreshed.
Use the database as the persistent source of truth.
Use localStorage only as a supporting cache.
A mission/session should have a unique ID.
Track timestamps.

7. OPTIONAL SOUND
Include a sound toggle.
Do NOT force autoplay audio.
If sound is enabled:

subtle terminal sounds
button clicks
confirmation sounds
warning sounds
transition sounds

Sound must be optional.
Respect browser autoplay restrictions.
Also respect:
prefers-reduced-motion
If reduced motion is enabled, substantially reduce animation.

8. OPENING SCENE
Start with a secure connection terminal.
Example:

ESTABLISHING SECURE CONNECTION...

Then:

ENCRYPTED CHANNEL INITIALIZED

Then:

CONNECTION STATUS: SECURE

Then:

IDENTIFYING RECIPIENT...

Then:

AGENT IDENTIFIED: PRISM

Then transition into the classified dossier.
Use typing effects and subtle terminal animation.

9. CLASSIFIED DOSSIER
Display:

TOP SECRET
CONFIDENTIAL MISSION BRIEFING

Then:

AGENT: PRISM
MISSION HANDLER: LAMA
MISSION ID: 03-10-26
STATUS: AWAITING ACCEPTANCE

Then:

Agent Prism, this is Agent Lama.


You have been selected for a highly classified operation scheduled for Saturday, October 3rd, 2026.

Then:

Do you accept the mission?

Buttons:
ACCEPT MISSION
DECLINE

10. NO BUTTON GAME
The NO button must be interactive using touch/click.
Do NOT depend on hover.
Every time Agent Prism taps NO:

record the event immediately in the database
increment the NO count
move the NO button somewhere else within the viewport
make the YES/ACCEPT button larger
display a reaction

The NO button must:

remain inside the viewport
never cause horizontal scrolling
never become impossible to tap because of overflow
work on mobile

YES growth approximately:

0 NO taps → 1.0x
1 → 1.12x
2 → 1.25x
3 → 1.40x
4 → 1.60x
5 → 1.85x

Messages:
After NO #1:

TARGET LOST

After NO #2:

DECLINE BUTTON HAS EVADED CAPTURE

After NO #3:

Agent Prism, you're making this unnecessarily difficult.

After NO #4:

Agent Lama is disappointed. 😔

After NO #5:

Are you sure about that? 👀

After exactly five NO attempts:
Move NO behind the ACCEPT button and hide/disable it.
Optional message:

DECLINE BUTTON: COMPROMISED.

Do not make the user permanently stuck.

11. MISSION FILES
After accepting, show the mission files.
Important:
These files reveal the normal date details but NOT the secret destination.

FILE 01 — EXTRACTION

DATE: 03/10/2026
PICKUP: 08:30 AM
LOCATION: AGENT PRISM'S RESIDENCE
TRANSPORT: AGENT LAMA


Agent Lama will arrive at your residence at 08:30 AM.


Be ready.


FILE 02 — DRESS CODE

SMART CASUAL


COMFORTABLE FOOTWEAR

Then:

You will understand later.

Do not explain why.

FILE 03 — FIRST OBJECTIVE

DEVELOPERS FESTIVAL

Objectives:

Attend event
Spend morning together
Have fun

Optional:

THREAT LEVEL: EXTREMELY NERDY


FILE 04 — LUNCH

CHECKPOINT — LUNCH


Every successful operation requires a refuelling checkpoint.


Lunch details will be revealed during the mission.

Do NOT frame lunch as a backup plan.
Do NOT say anything like:
"If the festival is boring..."
or:
"If lunch isn't good..."

FILE 05 — CLASSIFIED
Show a heavily redacted file.

DESTINATION: ███████████████


ACTIVITY: ███████████████


LOCATION: ███████████████


STATUS: CLASSIFIED


AUTHORIZED BY: AGENT LAMA


ACCESS LEVEL: INSUFFICIENT

Then:

You will receive clearance when the time is right.

This is where the guessing game begins.

12. DATE TIMELINE
Show the known timeline:
08:30 AM
EXTRACTION
MORNING
DEVELOPERS FESTIVAL
LUNCH
CHECKPOINT
LATER
CLASSIFIED DESTINATION
Do NOT reveal the escape room here.

13. THE SECRET DESTINATION GUESSING GAME
IMPORTANT:
This is ONLY a guessing game.
Do NOT treat it as the escape room itself.
The escape room is the secret destination.
The purpose of this game is simply to let Agent Prism attempt to figure out what the secret destination is.
The exact correct answer is:
HARRY POTTER ESCAPE ROOM
Only that complete answer should be considered correct.

14. FREE GUESSES
Agent Prism should be able to submit guesses without paying a kiss.
Provide an input:

ENTER YOUR GUESS

Button:

SUBMIT GUESS

Every submitted guess MUST be stored in the database.
Record:

session ID
exact text entered
normalized text
timestamp
guess number
correct/incorrect
current game stage

Do not delete incorrect guesses.
Do not overwrite them.
Every attempt is part of the mission history.
If the guess is wrong, show a playful reaction.
Examples:

NEGATIVE.


Agent Lama has reviewed the intelligence.


That does not appear to be the classified destination.


Investigation continues.

Do not reveal useful information from the wrong guesses.

15. CORRECT ANSWER
The only winning answer is:
HARRY POTTER ESCAPE ROOM
Normalize harmless differences such as:

capitalization
leading/trailing spaces
repeated spaces

But do NOT accept incomplete answers such as:

Harry Potter
Hogwarts
Escape Room
Harry Potter Room
Wizard Escape Room

If the answer is incomplete:

PARTIAL INTELLIGENCE DETECTED.


Your answer is incomplete.


The classified operation requires the full designation.

Continue the game.

16. KISS PROTOCOL
Before Agent Prism can request hints, require a one-time agreement.
Display:

CLASSIFIED INTELLIGENCE AGREEMENT


Each intelligence packet requires one kiss. 💋


Agent Prism must personally deliver one kiss to Agent Lama before intelligence can be unlocked.


By proceeding, you confirm that you intend to give Agent Lama the required kiss for each hint.

Button:

I ACCEPT THE KISS PROTOCOL 💋

When accepted, record in the database:

session ID
protocol accepted = true
timestamp

IMPORTANT:
The website cannot verify a physical kiss.
NEVER store:
kiss_received = true
Instead store the digital interaction:
kiss_protocol_accepted
and later:
hint_unlocked
The system should rely on the honor system.

17. HINT SYSTEM
There are exactly 10 hints.
Each hint costs:
1 KISS 💋
Before unlocking:

CLASSIFIED INTELLIGENCE AVAILABLE


ACCESS COST: 1 KISS 💋


Agent Prism must personally deliver one kiss to Agent Lama before intelligence can be unlocked.

Button:

UNLOCK HINT

After she has given the real-life kiss, she taps the button.
The database records:

session ID
hint number
hint unlocked
timestamp

Again, do NOT claim the website verified the physical kiss.

18. HINTS MUST BE DELIBERATELY USELESS
This is intentional.
The hints should be entertaining and technically true, but provide almost no useful information.
Do NOT accidentally make the hints progressively reveal Harry Potter or an escape room.
Use:
HINT 01

The answer is something you will recognise.

HINT 02

You have probably encountered the subject before.

HINT 03

There may be more than one person involved.

HINT 04

The mission may require you to think.

HINT 05

Time may become relevant.

HINT 06

The answer contains more than one word.

HINT 07

You may have seen something related to this on a screen.

HINT 08

The operation involves a location.

HINT 09

You may want to remember things you already know.

HINT 10

Agent Lama recommends investigating further.

After each hint, optionally display:

INTELLIGENCE QUALITY: QUESTIONABLE

And occasionally:

Agent Lama spent considerable resources obtaining this information.

The humour is intentional.
The player should feel amused rather than genuinely frustrated.

19. HINT PROGRESSION
Display something like:

INTELLIGENCE ACQUIRED
3 / 10

This is not a case board.
It is simply progress through the hint system.
Do not show information she already knows as a fake investigation board.

20. AFTER HINT 10
Make this a major cinematic transition.
Display:

INTELLIGENCE PACKET 10 DECRYPTED

Then:

PROCESSING...


CROSS-REFERENCING...


ANALYSING...

Then:

RESULT: INSUFFICIENT

Pause.
Then:

Agent Lama appears to have intentionally provided you with absolutely useless intelligence.

Then:

NEW INVESTIGATION PROTOCOL ACTIVATED.

Transition into Hangman.

21. HANGMAN
This is still part of the guessing game.
It is simply another method of discovering the secret destination.
The answer:
HARRY POTTER ESCAPE ROOM
Display four separate words.
Example:






Make sure the exact letter counts are correct.
Provide a mobile-friendly A-Z keyboard.
When a letter is selected:

record it in the database
prevent selecting the same letter twice
reveal all matching occurrences
if incorrect, decrease security integrity/lives
update the database immediately


22. HANGMAN VISUAL STYLE
Do NOT use a childish gallows.
Make it look like an espionage security system.
Use:

AGENT STATUS


SECURITY INTEGRITY: 6 / 6

Possible stages:
6/6:

SECURITY INTEGRITY: STABLE

5/6:

MINOR SECURITY BREACH

4/6:

SECURITY SYSTEMS ALERT

3/6:

INVESTIGATION COMPROMISED

2/6:

CRITICAL SECURITY WARNING

1/6:

AGENT SECURITY CRITICAL

0/6:
Do NOT permanently end the game.
Instead trigger the kiss save system.

23. WRONG LETTER REACTIONS
Use playful reactions.
Examples:

Agent Prism... that was not in the classified file.


The investigation has suffered a minor setback.


Agent Lama is keeping his confidence.


Security systems are becoming concerned.


The operation is hanging by a thread. Literally.

Do not make failures feel punishing or demotivating.

24. HANGMAN KISS SAVE
When security integrity becomes critical, display:

AGENT SECURITY COMPROMISED


ONE MORE MISTAKE MAY TERMINATE THE INVESTIGATION

Then:

Agent Prism can prevent the investigation from being terminated.


Agent Lama requires one kiss to restore the security system. 💋

Button:

SAVE THE INVESTIGATION 💋

After the real-life kiss, she taps the button.
Restore one life/security point.
Record:

session ID
save number
timestamp
state before save
state after save
hangman_save_used = true

Do NOT store kiss_received.
The digital event is the save activation.
Do not make the game permanently unwinnable.

25. HANGMAN LETTER SELECTION
Every letter interaction must be persisted.
Example database event:

selected letter = H
correct = true
lives before = 6
lives after = 6
revealed phrase = H _ _ _ _
timestamp

For an incorrect letter:

selected letter = X
correct = false
lives before = 6
lives after = 5
timestamp

The current game state should also be persisted so refreshing the page does not reset Hangman.

26. DIRECT ANSWER — 100 KISSES
There must be a way to bypass the guessing game.
But it must be absurdly expensive.
Button:

I KNOW THE ANSWER

When tapped, display:

DIRECT ANSWER PROTOCOL


ACCESS COST: 100 KISSES 💋


Agent Lama has determined that simply telling him the answer is an unnecessarily expensive alternative.


100 kisses are required to bypass the investigation.

Then:

[ PAY 100 KISSES ]

This does not mean the website verifies 100 physical kisses.
It is an honour-system romantic mechanic.
When she activates it, record:

direct answer protocol requested
timestamp
cost = 100
session ID

Then allow the answer field.
If she submits:

HARRY POTTER ESCAPE ROOM

→ success.
If incorrect:

DIRECT ACCESS FAILED.


Even after paying 100 kisses, Agent Prism has somehow managed to provide the wrong designation.

Then allow another attempt according to the chosen implementation.
Every submission must be recorded.

27. IMPORTANT GAME BALANCE
Do not make the game genuinely frustrating.
The intended experience is:

Guess freely.
Become curious.
Use funny useless hints.
Spend 10 kisses.
Reach Hangman.
Start getting genuine information through letters.
Use kisses strategically if necessary.
Solve the destination.
Get the reveal.

The game should feel like playful resistance, not punishment.
Do NOT permanently lock the player out.
Do NOT require perfect Hangman performance.
Do NOT make the player start from the beginning after refreshing.

28. SUCCESS SCREEN
When the exact answer is successfully discovered:
Display:

ACCESS GRANTED

Then:

FINAL SECURITY LAYER BYPASSED

Then dramatically reveal:
🪄 HARRY POTTER ESCAPE ROOM 🪄
Then:

Agent Prism...


You found it.


Your next mission is to escape.

This is the first time the actual secret destination is revealed.
Use a cinematic reveal.
The Harry Potter theme should feel magical and celebratory without suddenly turning the whole website into a generic Harry Potter fan page.

29. FINAL TRANSMISSION
After the reveal:

AGENT PRISM


Your mission has been accepted.


03.10.2026


08:30 AM


Agent Lama will be waiting.


Come prepared.


Trust the handler.


And most importantly...


Have fun. ❤️


— Agent Lama

Then:

MISSION STATUS: ACTIVE

Then:

THIS MESSAGE WILL SELF-DESTRUCT IN...


3


2


1

Then:

ERROR

Then:

Agent Lama clearly didn't pay for the self-destruct feature. 😂

Then:

MISSION ACTIVE


See you Saturday, Agent Prism. ❤️


30. FINAL DATE SUMMARY
After the secret reveal, show the actual known itinerary.
SATURDAY — OCTOBER 3, 2026
08:30 AM
Agent Lama picks up Agent Prism.
↓
MORNING
Developers Festival
↓
LUNCH
Refuelling checkpoint
↓
LATER
Harry Potter Escape Room 🪄
Keep this section hidden until the secret has been successfully revealed.

31. FINAL REPORT
At the end, generate a mission report.
Example:

CLASSIFIED MISSION REPORT


AGENT: PRISM


HANDLER: LAMA


MISSION: 03-10-26


STATUS: SUCCESSFUL

Include relevant statistics such as:

NO attempts
guesses made
hints unlocked
Hangman letters attempted
Hangman saves
final answer
time/date completed

Do not expose sensitive technical database information to Agent Prism.

32. SHARE REPORT
Provide:

SHARE MISSION REPORT

Use the native Web Share API when supported.
If native sharing is unavailable:

provide Copy Report button
show a confirmation

Do NOT claim that Agent Lama received the report.
Only record:
report_shared = true
if the share action actually succeeds according to the browser API.
Record:

timestamp
share attempted
share succeeded/failed


33. DATABASE — CORE REQUIREMENT
Create the PostgreSQL/Supabase schema yourself.
Do NOT tell me to manually create tables.
Generate migrations/schema files.
The database must be designed around an append-only event history plus current mission state.
At minimum create structures for:
missions / sessions
Track:

id
created_at
updated_at
mission status
current scene/stage
mission accepted
mission accepted timestamp
completed
completed timestamp


mission_events
A generic event/audit table.
Track:

id
mission_id
event_type
event_data JSONB
created_at

This should capture essentially every meaningful user interaction.
Examples:

mission_opened
no_clicked
mission_accepted
file_opened
guess_submitted
kiss_protocol_accepted
hint_unlocked
hangman_started
hangman_letter_selected
hangman_save_used
direct_answer_requested
direct_answer_submitted
destination_revealed
report_generated
report_shared

Do not overwrite historical events.

guesses
Track:

id
mission_id
guess_text
normalized_guess
guess_number
correct
created_at

Every guess must remain in the database.

hints
Track:

id
mission_id
hint_number
unlocked
unlocked_at


hangman_state
Track the current persistent Hangman state:

mission_id
phrase
revealed_letters
selected_letters
incorrect_letters
lives
max_lives
save_count
status
updated_at


hangman_events
Track individual letter actions and saves.
Track:

mission_id
event type
selected letter if applicable
correct/incorrect
lives_before
lives_after
revealed_state
timestamp


kiss_protocol
Track:

mission_id
accepted
accepted_at

Do NOT track whether a physical kiss occurred.

direct_answer_attempts
Track:

mission_id
requested
cost
answer
normalized_answer
correct
timestamp


report
Track:

mission_id
generated
generated_at
shared
shared_at


34. DATABASE RELIABILITY
Every important action should be written to the backend immediately.
If a request fails:

do not silently lose it
retain the event locally
retry
avoid duplicate events where possible

Use unique IDs/idempotency where appropriate.
The player should never lose progress because she refreshed the page.

35. SECURITY
The public player must NOT have unrestricted database write access.
Implement appropriate Supabase Row Level Security policies.
The player should only be able to interact with their own mission/session.
The Agent Lama Command Center must be protected.
Do not expose service-role keys in frontend code.
Never place Supabase service-role credentials in client-side JavaScript.
Use environment variables correctly.

36. AGENT LAMA COMMAND CENTER
Create a separate protected admin/Command Center.
This is for me, Agent Lama.
It should require authentication.
Do not expose it through the public invitation UI.
The Command Center should show live mission state.
Include:
MISSION STATUS

Active/completed
Mission accepted
Current scene
Started at
Last activity

ACCEPTANCE

Accepted
NO count

GUESSING GAME

Number of guesses
Full guess history
Correct/incorrect
Hints used
Kiss protocol accepted

HANGMAN

Current lives
Selected letters
Correct letters
Incorrect letters
Saves used
Current revealed phrase

FINAL ANSWER

Answer submitted
Number of attempts
Correct answer
Completion time

REPORT

Generated
Shared
Timestamp


37. LIVE COMMAND CENTER
Where practical, use Supabase realtime/subscriptions so the Command Center can update without manually refreshing.
For example:
If Agent Prism taps NO:
Command Center should eventually show:

NO ATTEMPTS: 3

If she uses a hint:

HINTS: 4 / 10

If she plays Hangman:

SECURITY INTEGRITY: 4 / 6

If she completes the game:

MISSION STATUS: SUCCESSFUL


38. COMMAND CENTER EVENT LOG
Create an event stream.
Example:

23:14:02 — Agent Prism accepted mission


23:14:15 — NO button compromised


23:15:31 — Guess submitted: "cinema"


23:17:08 — Kiss Protocol accepted


23:17:44 — Hint #1 unlocked


23:26:10 — Hint #10 unlocked


23:27:02 — Hangman initiated


23:27:19 — Letter H selected — CORRECT


23:28:05 — Security save used


23:31:47 — Destination revealed

This is meant to make the Command Center feel like a real mission monitoring system.

39. RESET / DEVELOPMENT TOOLS
For development, provide a safe way to reset a test mission.
Do not expose destructive reset controls to the public player.
The Command Center may have:

RESET TEST MISSION

with confirmation.
Never accidentally delete production data.

40. ACCESSIBILITY
Implement:

semantic HTML
keyboard accessibility
visible focus states
appropriate contrast
aria labels where necessary
buttons instead of clickable divs where possible
reduced motion support
readable font sizes

Do not rely solely on colour to communicate state.

41. ANIMATION
Use animations to make the experience cinematic.
Examples:

terminal typing
dossier loading
redacted text reveal
classified stamp animation
screen flicker
scanline movement
subtle glitch
secure connection animation
button movement
dramatic Hangman transition
final destination reveal

But avoid excessive animation.
The UI must remain responsive.

42. ERROR HANDLING
If the database is unavailable:
Do not display raw technical errors to Agent Prism.
Instead show something like:

SECURE CONNECTION INTERRUPTED


Attempting to restore connection...

Retry automatically.
For the Command Center, technical errors can be more descriptive.

43. NO PLACEHOLDER FUNCTIONALITY
Do not build fake buttons.
Every visible button must actually work.
Do not leave:

TODO
FIXME
"implement later"
fake database calls
fake authentication
fake persistence

If something is displayed as persistent, actually persist it.

44. CODE QUALITY
Keep the project understandable.
Use clear modules/functions.
Separate:

UI
game state
database
event logging
authentication
Hangman logic
mission logic
animations

Do not put the entire application into one giant JavaScript file if it can reasonably be organized.
Avoid unnecessary frameworks and dependencies.

45. TESTING
Before considering the implementation complete, test the full flow:

Open website
Secure connection animation
Dossier
Tap NO repeatedly
Verify NO moves
Verify YES grows
Accept mission
Open mission files
Reach secret destination game
Submit incorrect guess
Verify guess appears in database
Accept Kiss Protocol
Unlock hints
Verify each hint is persisted
Reach hint 10
Enter Hangman
Select correct letters
Select incorrect letters
Verify state persists after refresh
Trigger kiss save
Verify save is persisted
Test direct answer
Verify 100-kiss gate
Submit incomplete answer
Submit exact answer
Reveal Harry Potter Escape Room
Show final transmission
Generate report
Test native share/fallback
Open Command Center
Verify mission history
Verify all important events are visible


46. IMPORTANT FINAL RULES
Remember these above everything else:
RULE 1
The secret destination is:
HARRY POTTER ESCAPE ROOM
RULE 2
The guessing game exists to discover the secret destination.
It is NOT the escape room.
RULE 3
The main invitation must NOT reveal the secret destination before she solves the guessing game.
RULE 4
There are exactly 10 hints.
RULE 5
Each hint costs 1 kiss.
RULE 6
The hints are intentionally almost useless and humorous.
RULE 7
After 10 hints, Hangman begins.
RULE 8
Hangman uses:
HARRY POTTER ESCAPE ROOM
as the exact phrase.
RULE 9
Kisses can be used to save the Hangman investigation when security becomes critical.
RULE 10
The direct "I KNOW THE ANSWER" bypass costs 100 kisses.
RULE 11
The website never claims it physically verified a kiss.
It only records digital actions such as:

protocol accepted
hint unlocked
save activated
direct-answer protocol activated

RULE 12
Every meaningful interaction must be recorded in the database.
Do not only store the final state.
Maintain the historical event trail.
RULE 13
No personal photographs.
RULE 14
No case board that simply repeats information Agent Prism already knows.
RULE 15
The website should feel like a premium spy-thriller experience with romantic moments, not a generic Valentine's website.

47. BUILD IT NOW
Start by inspecting the existing project structure.
Then implement the complete system.
If Supabase credentials are not yet available, build everything around environment variables and provide a clear .env.example.
Generate the SQL migrations/schema.
Build the frontend.
Build the backend integration.
Build authentication.
Build the Command Center.
Build the game.
Build persistence.
Build the animations.
Build the responsive mobile UI.
Then test the complete flow.
Do not stop after generating a plan.
The objective is a working, polished, production-ready interactive experience.
