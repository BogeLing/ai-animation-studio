[hook gap=0.7]
Meet AI Animation Studio: a toolkit that lets a coding agent make animated films, written entirely as code.

[how gap=0.6]
There's no video model involved. The agent writes each scene in TypeScript, the papermotion engine renders it frame by frame, and even the music and the sound effects come from the same code.

[edit gap=0.7]
So every frame is exact, and easy to change. Move a prop, rewrite a caption, or retime a beat, then simply render again.

[install gap=0.5]
Getting started takes three commands. Clone the repository, install the dependencies, and run the smoke test. It renders a one-second film in two different ways, and checks that they match.

[render gap=0.7]
Then render a real film. One command gives you a five-second paper-plane short, with sound.

[ask gap=0.6]
Now open the project in Claude Code or Codex, and just ask. Describe your film in a sentence or two: the story, the style, and how long it should be.

[loop gap=0.6]
The film production skill walks the agent through a real production loop. It storyboards the film, shows you key frames to review, fixes the pacing, writes the score and the sound effects, and only then renders the whole thing.

[modules gap=0.6]
Along the way, it reuses ready-made scene modules: paper captions, title cards, hopping walks with a camera that follows, a sky that runs from morning to sunset, instant photos, and a lo-fi score.

[speed gap=0.8]
Rendering is fast. Frames are drawn in parallel, on your GPU when you have one, so a twelve-second film takes about forty seconds on a laptop. And every render is checked for glitches before it reaches you.

[outro]
Clone it, open your agent, and make your first film.
