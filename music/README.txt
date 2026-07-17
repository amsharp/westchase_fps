CAR RADIO MUSIC — drop your MP3 tracks here
============================================

The in-car radio (press R while driving to cycle stations) plays local MP3
files from this folder. There is NO limit to how many songs a station can have
— add as many as you like. The game only plays the files that are actually
listed in RADIO_STATIONS in game.js (car-radio section), so each song you add
here must also be listed there (a missing file just auto-skips to the next).

Suggested filenames (any names work, these are just the convention used):

  ELECTRONIC station:   electronic_1.mp3   electronic_2.mp3   electronic_3.mp3 ...
  RAP station:          rap_1.mp3          rap_2.mp3          rap_3.mp3 ...
  CHILL station:        chill_1.mp3        chill_2.mp3        chill_3.mp3 ...
  ROCK station:         rock_1.mp3         rock_2.mp3         rock_3.mp3 ...

How a station plays: SHUFFLE. When you tune in, the first song is chosen at
random. After that each song plays from a shuffled queue, so every song plays
once before any repeats, and the same song never plays twice back-to-back
(not even across a reshuffle). The radio only plays in the car you're driving,
and stops when you exit or the car is destroyed.

Format: MP3 (128-192 kbps is plenty). MP3 is the safest choice — every browser
decodes it and it streams straight off disk when the game is opened via
file:// (double-clicking index.html) as well as over http.

Until you add the files the radio is silent (no errors) — the station names
still cycle on screen; there's just nothing to play yet. To add/remove tracks
or rename stations, edit RADIO_STATIONS near the top of the car-radio section
in game.js.
