# Crossy Road in an Half-Hour

# What is this game?
This is a small clone of Crossy Road, originally made in half an hour with generative AI during a lecture of 15-113 (Effective Coding with AI). It's a Javascript game that uses [Three.js](https://threejs.org/). Unlike the original Crossy Road, there is no time pressure (the screen does not autoscroll).

## Controls and Scoring

- On desktop: **Arrow keys** or **WASD** to move around.
- On mobile: Swipe to move or tap to move forward.
Cross roads and rivers, avoiding cars and riding logs. But don't get carried offscreen by one!

Every one lane you reach increases your score by one. Try to get as far forward as possible!

## Generative AI
This project used the default agent of Kiro. Prompt logs are [here](prompt_log.md)! I one-shotted the base mechanics of the game, which led to a working prototype with some bugs and a lot of visual/gameplay inconsistency. I slowly honed each aspect until I got something that was satisfactory.

## Next Steps
I want to:
- Add a high score feature
- Overhaul the graphics (change car models, player model)
- Tune the difficulty vs. distance curve to be more bearable (it gets difficult too fast)

One visual bug is that you can go off the screen into ungenerated land if you move too far backwards!