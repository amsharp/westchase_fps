CAR RADIO MUSIC — drop your MP3 tracks here
============================================

The in-car radio (press R while driving to cycle stations) plays local MP3
files from this folder. Use these EXACT filenames — the game looks for them
by name:

  ELECTRONIC station:   electronic_1.mp3   electronic_2.mp3   electronic_3.mp3
  RAP station:          rap_1.mp3          rap_2.mp3          rap_3.mp3
  CHILL station:        chill_1.mp3        chill_2.mp3        chill_3.mp3
  ROCK station:         rock_1.mp3         rock_2.mp3         rock_3.mp3

Each station plays its three songs in order and loops back to the first after
the third ends. The radio only plays in the car you're driving, and stops when
you exit or the car is destroyed.

Format: MP3 (128-192 kbps is plenty). MP3 is the safest choice — every browser
decodes it and it streams straight off disk when the game is opened via
file:// (double-clicking index.html) as well as over http.

Until you add the files the radio is silent (no errors) — the station names
still cycle on screen; there's just nothing to play yet. To add more or fewer
tracks per station, or rename stations, edit RADIO_STATIONS near the top of the
car-radio section in game.js.
