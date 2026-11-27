# The stall pitch: ABP Infocom 2026

Spoken, not read. Pick one of three pitches by your mood and by who's in
front of you. Each is **about 30 seconds**: a hook, one thing to show, one
proof, a **wow** line, then the same close every time, the funding ask with
the QR code.

Say it to the person, not the poster. Put the badge in their hands as early
as you can.

---

## The opener (5 seconds, for anyone walking past)

> **"Want to see a badge that runs its own operating system?"**

If they stop, pick a pitch.

---

## Pitch A · "It's a computer" (playful mood; students, the general public)

**The big idea:** a conference badge that's a real computer, with its own OS
and an App Store.

> "Every event gives you a badge, and you throw it away in two days.
>
> This one you keep. *[hand them the badge, press A]* It runs its own
> operating system, **FaleraOS**, which I wrote. It has apps, games and an
> App Store, *[open the App Store]* and it updates itself over the air, like
> your phone.
>
> I designed the board, and I wrote the OS.
>
> **So this isn't a badge with a computer in it. It's a computer you wear
> round your neck.**"

→ the close

---

## Pitch B · "The video trick" (technical mood; engineers, developers)

**The big idea:** RV565, a video format I invented, makes smooth video
possible on a tiny chip.

> "A chip like this has no business playing video. When I first tried, I
> got **half a frame per second**.
>
> So I invented a video format, **RV565**. It sends the screen only what
> changed. *[play a clip]* That took it from half a frame a second to
> **24 frames a second**.
>
> Adafruit featured it, the research paper is on arXiv, and other makers
> use it now.
>
> **I didn't make the chip faster. I made it send less.**"

→ the close

*If they ask about speed inside the OS: 24 FPS is the firmware path on the
ESP32-S3; inside FaleraOS (MicroPython) it's 12.2 FPS. Never say "24 FPS in
MicroPython".*

---

## Pitch C · "Open, and built here" (big-picture mood; industry, sponsors, faculty)

**The big idea:** certified open hardware from India that any event can
hand out, and anyone can build.

> "Most events can't afford their own electronic badge: it takes a hardware
> team and months of work.
>
> So I built one anyone can use. *[point to the 3D board on the poster]* The
> design is **certified open source hardware**, by OSHWA. Espressif, who
> make the chip, gave it its own USB ID. Every file is public: you can
> build one yourself tonight.
>
> **One student, in Kolkata, built a badge the world can copy, and it's
> already certified.**"

→ the close

---

## The close: the funding ask (every pitch, 10 seconds)

*[point to the funding QR code]*

> "We're building the first batch of real boards right now, and you can be
> part of it. **₹100 buys the buttons for one badge. ₹1,000 pays for a whole
> circuit board.** Scan this, and your name goes on our website."

For companies, add:

> "And if your company wants its name on the board itself, we have sponsor
> levels from ₹10,000. Here's my card." *[hand a QR card]*

- **Fundraiser:** payouts.elixpo.com/f/falera-badge (QR on the funding card).
  On 26 Nov it showed ₹1,122 of ₹8,000 from 17 supporters, for the first five
  boards: check the live number before you quote it.
- **Their prices, word for word:** ₹100 buys the buttons for one badge ·
  ₹250 a battery · ₹500 the chip that charges it · ₹1,000 a whole circuit
  board · ₹2,000 most of a badge.
- Every supporter is thanked by name on falera.elixpo.com.

---

## Quick answers

| They ask | You say |
| --- | --- |
| Who made it? | "I did: the board and the OS. With Vivek Yadav and Anwesha Chakraborty at Elixpo." |
| Can I buy one? | "Not yet: the first real boards are being made now. Back it on the QR, and you'll hear first." |
| What does one cost to make? | "About ₹4,000 in parts." |
| Can I build my own? | "Yes. Everything is on GitHub: scan this card." |
| What chip is it? | "An ESP32-S3, with a 2.8-inch screen, eight buttons, a motion sensor and infrared." |
| Is it fast? | Video: "24 frames a second with RV565 on the chip; about 12 inside the OS." |
| Is it published? | "The RV565 paper is a preprint on arXiv." (Not a journal.) |
| What's on the table? | "The working prototype, on a breadboard. The final board is in the 3D render." |

## Don't say

- "24 FPS in MicroPython" or "in FaleraOS" (it's 12.2 FPS there).
- "Adafruit endorsed it" (they **featured** it).
- "Published in a journal" (it's an arXiv **preprint**).
- "OSHWA certified this badge on the table" (they certified the **board
  design**; the table has the prototype).
- Anything about CircuitPython video (it's experimental).
- "Oreo", anywhere. It's **Falera** and **FaleraOS**; the panda is **Lumi**.

## Props

- The breadboard prototype, on, with the home screen and a video ready.
- The bare PCB, if it has arrived.
- The poster, the funding card (`out/funding-card.pdf`) and the QR handout
  cards (`out/qr-cards-a4.pdf`).
- Pocket cue cards with the three pitches (`out/cue-cards-a4.pdf`).
