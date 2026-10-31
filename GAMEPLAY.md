# Schnau: Gameplay

A cozy, very silly phone arcade game. You're a small dog guarding Grandma's
cottage and its treat jar from goblins, bugs and, at last, a dragon. You
can't bite anyone; you **bark**, and they run away scared.

Think of it as a defence-only action game: no buildings yet, just the dog.
A run lasts about **2 minutes**, ending with the dragon (who arrives at about 1:10).

Numbers live in `src/content/gameTuning.ts`; everything below is a starting
point to tune by feel.

---

## The yard

- **Grandma's cottage** sits in the middle of a round garden. Its **treat jar**
  starts with **10 treats**: what everything is after, and your score.
- Your **doghouse** is beside the cottage.
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

**Health.** The dog has **5 hearts**. Goblins swat it, bugs sting it, dragon
fire burns it (with a moment of safety after each hit). At zero hearts the dog
doesn't die: it's **pooped**, and trots home to its doghouse on its own (you
can't steer), goes all the way inside for a short nap (Zz), and comes back out
of the door with full hearts. The
cost is time: while you're away, nobody is guarding the treats.

**Two dogs**, one per run (`?dog=spitz`; a picker comes later):

- **Schnauzer:** the bigger WOOF, which also charges faster. A slower dash.
- **Spitz:** quicker yips that reach further. A faster, longer dash.

## Barking: yip vs. WOOF

Every enemy has **courage pips**. Barks take pips away; at zero the enemy
**panics**, runs off into the woods, and drops a **bone** (bones will pay for
upgrades).

| | **Yip** (tap) | **WOOF** (hold, then release) |
|---|---|---|
| Shape | A narrow cone, long reach. It snaps to the nearest enemy roughly in front of you. | A burst all around you, short reach. |
| Scare | **1 pip**, and a **startle**: the enemy freezes for a moment, and a goblin drops what it's carrying. | **2–3 pips** (more the longer you charge), and **knockback**. |
| Rhythm | Quick, spammable. | Slow to charge; you crawl while charging; longer cooldown. |
| Good for | Single goblins, and making thieves drop treats. | Bug swarms and crowds. |

## Enemies

**Goblin** (2 pips). Walks to the cottage, grabs a treat and runs back to the
woods with it. Startle a goblin carrying a treat (a yip) and it **drops it**:
trot over the treat to bring it home. Scaring it off for good also drops the
treat. A goblin that reaches the woods with a treat steals it for good.
Goblins swat the dog if it's in their face.

**Bug swarm** (1 pip each, but they come in clouds of several swarms). Fast,
wobbly, and they go for the dog first if it's near, stinging it; otherwise
they head for the jar and eat a treat. Yips hit one swarm at a time: a WOOF
scatters the whole cloud. *Designed for the WOOF.*

**Dragon** (the finale, 12 pips). Big, slow and a bit dopey. It plods
toward the cottage, nibbling treats if it gets there, and attacks the dog with
**highly telegraphed fire**: a glowing circle appears where the dog is
standing, fills up, then fire lands there. Get out of the circle. Several
circles at once later on. It doesn't startle. *Designed for kiting*: bark,
run, bark, run. Scare it off and you win.

## A run

About a minute of waves, busier as it goes: goblins first, then bug clouds,
then both; then the dragon at about 1:10 (with a few goblins). The run ends when:

- **The dragon flees:** you win. Your score is the treats still in the jar
  (and bones collected).
- **The jar is empty:** game over.

## Upgrades (next)

Mostly for the dog, bought with bones between waves: louder WOOF (more
radius), longer yip, faster charge, more hearts, longer dash, treat magnet…
plus a few fixed ones (a fence, a sprinkler). Not built yet: first we see if
the dog alone is fun.
