# Schnau: Gameplay

A cozy, very silly phone arcade game. You're a small dog guarding a pen of
sheep from goblins, bugs and, at last, a dragon. You
can't bite anyone; you **bark**, and they run away scared.

Think of it as a defence-only action game: no buildings yet, just the dog.
A run lasts about **a minute and a half**, ending with the dragon (who arrives at 0:45).

Numbers live in `src/content/gameTuning.ts`; everything below is a starting
point to tune by feel.

---

## The yard

- **The sheep pen** sits in the middle of a round yard, with **8 sheep** milling
  about inside: what everything is after, and your score.
- Your **doghouse** is beside the pen.
- **Trees** dot the yard (round leafy ones and pines). They're solid: the dog
  and the goblins and bugs go round them (the dragon is too big to care).
  Flowers you can trot straight through.
- Enemies walk in from the woods all around the edge.

## The dog

**Controls** (one thumb each side):

| Control | What it does |
|---|---|
| **Direction circle** (left) | Steer. Push to the edge to trot. |
| **Dash** (right) | A burst of gallop. You can't be hurt while dashing. Short cooldown. |
| **Woof** (right), **tap** | A **yip**. |
| **Woof**, **hold** | Charge a **WOOF**: you slow down while it builds, and it goes off when you let go. |

Desktop: WASD or arrows to move, Shift to dash, Space to woof (tap or hold).

**Health.** The dog has **2 hearts**. Goblins swat it, bugs sting it, dragon
fire burns it (with a moment of safety after each hit). At zero hearts the dog
doesn't die: it's **pooped**, and trots home to its doghouse on its own (you
can't steer), goes all the way inside for a short nap (Zz), and comes back out
of the door with full hearts. The
cost is time: while you're away, nobody is guarding the sheep.

**Two dogs**, one per run:

- **Roz** (the black schnauzer): the bigger WOOF, which also charges faster. A slower dash.
- **Lumen** (the cream spitz): quicker yips that reach further. A faster, longer dash.

**The start menu** is the yard with Roz and Lumen pottering about on the
lawn in front of the doghouse. Tap **Roz** or **Lumen**: that dog lights up
with a gold outline, turns to you and barks, and a line says what it's better
at. Then **Play**. (`?dog=schnauzer` or `?dog=spitz` skips the menu.) After a
run, **Play again** goes back to the start menu.

## Barking: yip vs. WOOF

Every enemy has **courage pips**. Barks take pips away; at zero the enemy
**panics**, runs off into the woods, and drops a **bone** (bones will pay for
upgrades).

| | **Yip** (tap) | **WOOF** (hold, then release) |
|---|---|---|
| Shape | A narrow cone, long reach. It snaps to the nearest enemy roughly in front of you. | A burst all around you, short reach. |
| Scare | **1 pip**, and a **startle**: the enemy freezes for a moment, and a goblin drops what it's carrying. | **1 pip** to everything it reaches (charging longer reaches further), and **knockback**. |
| Rhythm | Quick, spammable. | Slow to charge; you crawl while charging; longer cooldown. |
| Good for | Single goblins, and making thieves drop sheep. | Bug swarms and crowds. |

## Enemies

**Goblin** (2 pips). Walks to the pen, grabs a sheep, holds it up over its
head and runs back to the woods with it. Startle a goblin carrying a sheep (a
yip) and it **drops it**. Scaring it off for good also drops the sheep. A
goblin that reaches the woods with a sheep steals it for good.

**Loose sheep.** A dropped sheep (or one bolting from bugs) is loose: it
wanders off toward the woods. Trot over to it and it hurries back
to the pen. One that wanders into the woods is lost.
Goblins swat the dog if it's in their face.

**Bug swarm** (1 pip each, but they come in clouds of several swarms). Fast,
wobbly, and they go for the dog first if it's near, stinging it; otherwise
they head for the pen and pester the sheep until one **bolts**, jumping the
fence and wandering off loose. Yips hit one swarm at a time: a WOOF
scatters the whole cloud. *Designed for the WOOF.*

**Dragon** (the finale, 12 pips). Big, slow and a bit dopey. It plods
toward the pen, **snatching a sheep** now and then if it gets there (gone for
good), and attacks the dog with
**highly telegraphed fire**: a glowing circle appears where the dog is
standing, fills up, then fire lands there. Get out of the circle. Several
circles at once later on. It doesn't startle. *Designed for kiting*: bark,
run, bark, run. Scare it off and you win.

## A run

About 45 seconds of waves, busier as it goes: goblins first, then bug clouds,
then both; then the dragon at 0:45 (with a few goblins). The run ends when:

- **The dragon flees:** you win. Your score is the sheep still in the pen
  (and bones collected).
- **No sheep are left** (none in the pen, loose or being carried off): game over.

## Upgrades (next)

Mostly for the dog, bought with bones between waves: louder WOOF (more
radius), longer yip, faster charge, more hearts, longer dash, a sheep whistle…
plus a few fixed ones (a fence, a sprinkler). Not built yet: first we see if
the dog alone is fun.
