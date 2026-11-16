# Wall Tones 2: Too fast to wall

Proposed full submission copy for review. Not yet applied to Devpost.

## Tagline

Remember the pattern. Earn energy. Close the Rifts. A seated, hands-first musical memory game with a mystery in your room.

## Inspiration

Wall Tones 2: Too fast to wall is a completely new sequel to my original Wall Tones. The original, which is in the Meta Horizon store, was built a few years ago for a hackathon in Unity, without hand interaction.

This time, I wanted to bring the game into mixed reality and turn the room around you into part of the experience. For this competition, I also wanted to make it possible to play sitting down. A table gives the four pads a familiar place in your own room, with the musical memory challenge within reach.

## What it does

It starts like Simon: four colored pads play a growing sequence of tones. Watch, listen, and repeat the pattern by touching the pads in order. Each completed pattern adds another note.

But remembering the music is only the beginning. Making progress through the patterns earns energy. As you advance, the game opens Rifts in your room, and you spend that energy to close them. The memory challenge and the mystery are connected: playing the patterns gives you the energy you need to deal with what appears around you.

For seated play, place the four pads on a table and repeat the sequence by touching them with your tracked fingertips. You can also place the pads on walls or in the air. Wall placement is an alternative for players who want to move around, rather than a requirement for playing.

There's also a desktop mode for playing and testing without a headset, plus a choice of recorded male and female host voices. The spoken guidance should help you understand what to do while leaving room to concentrate on the musical pattern.

If you want a look at features introduced later in the story without playing all the way through, the Lab offers a more technical way to try them. It also contains spoilers. Play the main game first if you'd rather discover the surprises as you progress.

## How we built it

I built the sequel with Meta's Immersive Web SDK (IWSDK), TypeScript and Vite. The playable web build is hosted on Cloudflare Workers.

The move to a web-based workflow made it much quicker to try an idea, check it on desktop, and then return to the headset for the parts that need real mixed-reality testing. Desktop checks are useful, but they do not replace checking placement, reach and hand interaction on the device.

## Challenges we ran into

I initially tried Unity with the new Meta CLI, Unity CLI and ADLC, but that workflow wasn't working for me: each iteration cycle took about an hour. Moving to IWSDK made it much faster to try ideas and test changes.

Hardware access was a real constraint. I use a Quest Pro, don't have a Quest 3 or 3S, and don't have a devkit for VR glasses. I also wanted to explore eye tracking, but couldn't use it through IWSDK for this project.

On the game side, adapting pad placement to different rooms, handling hand interactions reliably, and fitting spoken guidance around the musical patterns all needed care. The voice should help you play, not interrupt your concentration. Seated play adds another practical check: the pads and controls need to be placed where you can comfortably reach them.

## Accomplishments that we're proud of

I'm proud of building a new mixed-reality sequel with hand interaction, flexible room placement and a browser-based desktop mode, rather than simply moving the old Unity project to a different platform.

Web-based cloud coding agents also let me keep developing without being next to the gaming desktop that runs my Unity setup. I could keep working while moving between places, including on the bus or during a party, and while away from my VR headset.

That freedom, combined with faster iteration, made a big difference to the experience of building the game. I could make progress on code and desktop checks wherever I was, then come back to the headset for the testing that needs it.

## What we learned

For this project, iteration speed mattered as much as the features of the engine. IWSDK gave me a much quicker development loop than the Unity workflow I tried.

I also learned how useful cloud-based development can be for an XR project. Working away from the headset is useful for code and desktop checks, but the physical experience still has to be checked on hardware: how the pads fit into a room, how the hands interact with them, and whether the setup is comfortable when sitting down.

## What's next for Wall Tones 2: Too fast to wall

More features, bug fixes and different playing modes. My focus is to keep testing and improving the core experience: pad placement, hand interaction, spoken guidance and comfortable seated play.

## Built With

- Meta Immersive Web SDK (IWSDK)
- TypeScript
- Vite
- Cloudflare Workers

## Try it out

https://iwsdkmetaoct2026pub.cloudflareazure.workers.dev/

A game by Oded Sharon, Corbomite Games.
