This is a personal project that first started as a preset (The "Game Master" Preset), which I finally decided to turn into an extension. This is highly experimental, albeit stable for use, so I decided to share it here. 

This is **most** suitable for those who want the AI to act as a game/dungeon master, though it works with one-on-one roleplays as well. 

What it does: 

1. Allows you to create a player character (or convert your existing persona) complete with stat buy, genre selection, and detailed character information. 
2. Context-aware action resolution for combat, environmental challenges, success/failure, wounds, damage, incapacitation, impairment, death and more.  A semantic layer interprets the scene, and decides whether mechanics are necessary. This keeps the extension from rolling mechanics on mundane, no-stakes actions. This takes into account combat sequences (up to three attacks in a row) and individually determines how many of them land (if any). 
3. Context-aware NPC relationships and behavior. NPCs will have an initial impression of you based on various factors, and as you interact with them, this will change (for better or worse). NPCs will act depending on how they feel towards you. This ties in to the lightweight fame/infamy system, which takes into account significant actions and spreads your influence. A demon character who is unwelcome today, might be tolerated tomorrow (and even admired. Or hated). 
4. Context-aware event engine: can rarely introduce small events into the story, ranging from hostile, to merely annoying, to beneficial. Takes into account location and scene facts.
---
5. Proactivity Engine: Based on various factors, NPCs can take the initiative and act on their own, instead of merely responding to you. The tavern drunk might decide to throw a punch first. A companion might jump in front of the arrow meant for you. An opponent might exploit an opening and counter-attack in the same turn. An NPC with a crush on you might get you a gift. A companion you just met might abandon you when that dungeon run goes awry. And so on.
6. Power Actors: The consequences of your actions go beyond the current scene. Powerful entities might decide that you are a "pest" that needs to be eliminated, and will take steps to get it done. They might even go as far as planting a spy -someone who could even pretend to be your friend or lover, but is secretly plotting against you-. 

7. Name Generation Engine: Generates unique names every turn. When the LLM introduces a new NPC or location, it uses one of those names based on the style chosen in the settings. Goodbye, Elara!

8. Prose Rules: Strict prose rules baked in (plus a post-narration repair pass) that greatly reduces common offenders and "AI'isms". 

9. And a bunch of other smaller things meant to make roleplay more enjoyable, at least from my point of view. 

---
How does it work? 

→ The User sends a message. 

→ The extension requests a strict ledger from the semantic layer. What is the user trying to do? Does it carry risk? (monetary, physical, etc). Is anyone opposing it? And a few other questions.

→ When the ledger is returned, if mechanics are needed, the deterministic engine rolls the dice for both the user and the opposing entity, and determines the outcome. It is at this step where the Random Event and NPC Proactivity Engines run as well. Names are generated, and the scene outcome is decided. The extension then crafts a "Scene Resolution" Prompt for the narrator model. 

→ Narrator model receives the prompt, which tells it what the user is trying to do, whether they succeed or fail, how NPCs react, etc. This is usually open-ended. For example: "The user's action is a critical success. It lands with major visible impact according to the action and scene." (There is a lot more guidance in this prompt, since it also accounts for NPCs, too). 

→ Model narrates. 
→ Post-narration prose repair runs. 
---
Caveats: 

1. This extension requires a separate model (you can set it in settings) for the semantic ledger, which is highly  recommended to be a fast, cheap model. I find that DeepSeek Flash is excellent for this job. I cannot stress this enough. A normal model will take forever to return the required ledger, which can make responses extremely slow. 

2. The same preset chosen above is also used for prose repair, which you can disable if you want to (I wouldn't recommend it, unless you miss the smell of ozone). 
 
3. I highly recommend turning off Reasoning Formatting in SillyTavern settings and "Request Reasoning" in your preset. 

4. Any preset that adds mechanics, dice rolls, or attempts to do anything similar will naturally conflict with this extension.  

5. While you can use any preset (as long as it does not conflict as per #3), I recommend using the one included in the github. It is a basic, simple preset, which is all you need with this extension. 

Last, but not least: As I stated in the beginning, this is a personal project. I am sharing it because I genuinely think that for some of you, it'll be a great addition to your roleplay. But besides fixing issues that pop up along the way, I don't see myself adding any features that do not align with my vision. (Doesn't hurt to ask, though!) 

Without further ado: Here's a video showcasing the character creation process. 

https://www.youtube.com/watch?v=uorpMcxUuk8

