(function () {
  'use strict';

  // Original music and sound effects are synthesized locally, without downloads.
  const THEMES = [
    { bpm: 68, chords: [[50,53,57],[46,50,53],[48,52,55],[45,48,52]], color: 'triangle', cutoff: 1600 },
    { bpm: 74, chords: [[57,60,64],[53,57,60],[55,59,62],[52,55,59]], color: 'sine', cutoff: 2400 },
    { bpm: 80, chords: [[52,55,59],[48,52,55],[50,54,57],[47,50,54]], color: 'triangle', cutoff: 2100 }
  ];
  const frequency = note => 440 * Math.pow(2, (note - 69) / 12);
  const volume = (value, fallback) => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : fallback)) / 100;

  class GameAudio {
    constructor(settings) {
      this.settings = settings;
      this.context = null;
      this.engaged = false;
      this.paused = false;
      this.resumePromise = null;
      this.chapter = 0;
      this.scene = 'home';
      this.musicTimer = null;
      this.musicVoices = new Set();
      this.effectVoices = new Set();
      this.effectEpoch = 0;
      this.duckUntil = 0;
      this.musicTarget = -1;
    }

    createContext() {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      try {
        const context = new AudioContext({ latencyHint: 'interactive' });
        this.context = context;
        this.musicBus = context.createGain();
        this.effectBus = context.createGain();
        this.musicBus.gain.value = 0;
        this.effectBus.gain.value = this.settings.sound ? volume(this.settings.soundVolume, 65) * .9 : 0;

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 14;
        compressor.ratio.value = 3;
        compressor.attack.value = .006;
        compressor.release.value = .18;
        const master = context.createGain();
        master.gain.value = .85;
        compressor.connect(master);
        master.connect(context.destination);
        this.musicBus.connect(compressor);
        this.effectBus.connect(compressor);

        const reverb = context.createConvolver();
        const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 1.8), context.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.5);
        }
        reverb.buffer = impulse;
        const musicSend = context.createGain(), effectSend = context.createGain(), wet = context.createGain();
        musicSend.gain.value = .32;
        effectSend.gain.value = .10;
        wet.gain.value = .6;
        this.musicBus.connect(musicSend);
        this.effectBus.connect(effectSend);
        musicSend.connect(reverb);
        effectSend.connect(reverb);
        reverb.connect(wet);
        wet.connect(compressor);

        this.noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const noise = this.noiseBuffer.getChannelData(0);
        let brown = 0;
        for (let i = 0; i < noise.length; i++) {
          const white = Math.random() * 2 - 1;
          brown = (brown + .025 * white) / 1.025;
          noise[i] = brown * 2.5 + white * .18;
        }
        context.addEventListener('statechange', () => {
          if (context.state === 'running' && !this.paused && !document.hidden) this.syncMusic();
          else this.stopMusic(.02);
        });
        return true;
      } catch (error) {
        this.context?.close().catch(() => {});
        this.context = null;
        return false;
      }
    }

    // The first pointer or keyboard gesture unlocks audio; page load stays silent.
    unlock() {
      if (this.paused || document.hidden || (!this.settings.music && !this.settings.sound)) return;
      this.engaged = true;
      if (!this.context && !this.createContext()) return;
      if (this.context.state === 'running') {
        this.syncMusic();
        return;
      }
      if (!this.resumePromise) {
        this.resumePromise = this.context.resume().then(() => {
          this.resumePromise = null;
          if (!this.paused && !document.hidden) this.syncMusic();
        }).catch(() => { this.resumePromise = null; });
      }
    }

    configure(settings) {
      this.settings = settings;
      if (!this.context) return;
      const now = this.context.currentTime;
      this.effectBus.gain.setTargetAtTime(settings.sound ? volume(settings.soundVolume, 65) * .9 : 0, now, .025);
      if (!settings.sound || volume(settings.soundVolume, 65) === 0) this.stopEffects(.025);
      this.refreshMusicVolume();
      this.syncMusic();
    }

    setScene(chapter, scene) {
      const next = Math.max(0, Math.min(THEMES.length - 1, chapter));
      if (next !== this.chapter) {
        this.stopMusic(.3);
        this.chapter = next;
      }
      this.scene = scene;
      if (scene === 'playing') this.duckUntil = 0;
      this.refreshMusicVolume();
      this.syncMusic();
    }

    refreshMusicVolume() {
      if (!this.context) return;
      const now = this.context.currentTime;
      const sceneLevel = this.scene === 'playing' ? 1 : this.scene === 'home' ? .75 : this.scene === 'won' || this.scene === 'failed' ? .30 : .55;
      const target = this.settings.music && !this.paused && !document.hidden
        ? volume(this.settings.musicVolume, 35) * .32 * sceneLevel * (now < this.duckUntil ? .28 : 1) : 0;
      if (Math.abs(target - this.musicTarget) > .000001) {
        this.musicBus.gain.setTargetAtTime(target, now, .12);
        this.musicTarget = target;
      }
    }

    syncMusic() {
      if (!this.context || this.context.state !== 'running' || !this.engaged || this.paused || document.hidden || !this.settings.music || volume(this.settings.musicVolume, 35) === 0) {
        this.stopMusic(.15);
        return;
      }
      this.refreshMusicVolume();
      if (this.musicTimer !== null) return;
      this.step = 0;
      this.nextBeat = this.context.currentTime + .08;
      const schedule = () => {
        if (this.context.state !== 'running' || this.paused || document.hidden) {
          this.stopMusic(.02);
          return;
        }
        const now = this.context.currentTime;
        // Skip elapsed beats after a throttled timer rather than playing a burst.
        if (this.nextBeat < now - .1) this.nextBeat = now + .04;
        while (this.nextBeat < now + .22) {
          this.scheduleBeat(this.step, this.nextBeat);
          this.nextBeat += 30 / THEMES[this.chapter].bpm;
          this.step = (this.step + 1) % 128;
        }
        this.refreshMusicVolume();
      };
      this.musicTimer = window.setInterval(schedule, 100);
      schedule();
    }

    scheduleBeat(step, time) {
      const theme = THEMES[this.chapter], bar = Math.floor(step / 8), beat = step % 8;
      const chord = theme.chords[bar % theme.chords.length], barLength = 240 / theme.bpm;
      if (beat === 0) {
        chord.forEach((note, i) => this.tone(note, time, barLength + .7, {
          music: true, type: 'sine', gain: .045, attack: .65, sustain: .65,
          release: 1, cutoff: 900, detune: (i - 1) * 3, pan: (i - 1) * .35
        }));
        this.tone(chord[0] - 12, time, barLength * .8, { music: true, gain: .06, attack: .15, cutoff: 500 });
      }
      if (beat % 2 === 0 && !(bar % 4 === 3 && beat === 6)) {
        const pattern = [0,2,1,2,1,0,2,1];
        const note = chord[pattern[(bar + beat / 2) % pattern.length]] + 12 + (bar % 8 === 7 ? 12 : 0);
        this.tone(note, time, this.chapter === 2 ? .75 : 1.35, {
          music: true, type: theme.color, gain: .085, cutoff: theme.cutoff, pan: Math.sin(step * .6) * .35
        });
        if (this.chapter === 1) this.tone(note + 12, time, .9, { music: true, gain: .018, pan: -.25 });
      }
      if (this.chapter === 2 && beat === 5) this.tone(chord[2] + 12, time, .35, { music: true, gain: .035, type: 'triangle', cutoff: 1800, pan: .3 });
    }

    tone(note, time, duration, options = {}) {
      const source = this.context.createOscillator();
      source.type = options.type || 'sine';
      source.frequency.setValueAtTime(frequency(note), time);
      if (options.endNote !== undefined) source.frequency.exponentialRampToValueAtTime(frequency(options.endNote), time + duration);
      source.detune.value = options.detune || 0;
      this.voice(source, time, duration, options);
    }

    noise(time, duration, options = {}) {
      const source = this.context.createBufferSource();
      source.buffer = this.noiseBuffer;
      this.voice(source, time, duration, { cutoff: 900, ...options });
    }

    voice(source, time, duration, options) {
      const context = this.context, gain = context.createGain(), filter = context.createBiquadFilter();
      const peak = options.gain ?? .12, attack = Math.min(options.attack ?? .006, duration / 3);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(peak, time + attack);
      if (options.sustain) {
        gain.gain.linearRampToValueAtTime(peak * options.sustain, time + duration - Math.min(options.release || .1, duration / 2));
        gain.gain.linearRampToValueAtTime(0, time + duration);
      } else {
        gain.gain.exponentialRampToValueAtTime(.0001, time + duration - .005);
        gain.gain.linearRampToValueAtTime(0, time + duration);
      }
      filter.type = options.filter || 'lowpass';
      filter.frequency.setValueAtTime(options.cutoff || 4500, time);
      if (options.endCutoff) filter.frequency.exponentialRampToValueAtTime(options.endCutoff, time + duration);
      filter.Q.value = .55;
      const nodes = [source, gain, filter];
      source.connect(gain);
      gain.connect(filter);
      let output = filter;
      if (context.createStereoPanner) {
        const pan = context.createStereoPanner();
        pan.pan.value = options.pan || 0;
        filter.connect(pan);
        output = pan;
        nodes.push(pan);
      }
      output.connect(options.music ? this.musicBus : this.effectBus);
      const voices = options.music ? this.musicVoices : this.effectVoices;
      const voice = { source, gain, nodes };
      voices.add(voice);
      source.onended = () => {
        nodes.forEach(node => node.disconnect());
        voices.delete(voice);
      };
      source.start(time);
      source.stop(time + duration + .02);
    }

    stopVoices(voices, fade) {
      if (!this.context) return;
      const now = this.context.currentTime;
      for (const voice of voices) {
        try {
          const param = voice.gain.gain;
          if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
          else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
          param.linearRampToValueAtTime(0, now + fade);
          voice.source.stop(now + fade + .01);
        } catch (error) { /* A source may have just ended. */ }
      }
    }

    stopMusic(fade = .15) {
      if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
      this.musicTimer = null;
      this.stopVoices(this.musicVoices, fade);
    }

    stopEffects(fade = .025) {
      this.effectEpoch++;
      this.stopVoices(this.effectVoices, fade);
    }

    play(kind, options = {}) {
      if (!this.settings.sound || volume(this.settings.soundVolume, 65) === 0 || this.paused || document.hidden) return;
      this.unlock();
      if (!this.context) return;
      if (this.context.state !== 'running') {
        const epoch = this.effectEpoch, requested = performance.now();
        this.resumePromise?.then(() => {
          if (epoch === this.effectEpoch && performance.now() - requested < 350 && this.context.state === 'running') this.play(kind, options);
        });
        return;
      }
      const time = this.context.currentTime + .008;
      if (kind === 'roll') {
        const duration = options.duration || .165;
        this.noise(time, Math.max(.075, duration), { gain: .17, cutoff: 750, endCutoff: 350, attack: .018 });
        if (options.landing !== false) {
          this.tone(options.upright ? 37 : 41, time + duration, .14, { type: 'triangle', endNote: 29, gain: options.upright ? .20 : .15, cutoff: 850 });
          this.noise(time + duration, .07, { gain: .11, cutoff: 1100 });
        }
      } else if (kind === 'undo') {
        this.tone(57, time, .18, { endNote: 64, gain: .10, type: 'triangle', cutoff: 1500 });
      } else if (kind === 'activate') {
        [74,81,86].forEach((note, i) => this.tone(note, time + i * .095, .65, { gain: .12 - i * .015, pan: (i - 1) * .2 }));
      } else if (kind === 'echo') {
        [81,78].forEach((note, i) => this.tone(note, time + i * .14, .38, { gain: .075 }));
      } else if (kind === 'fail') {
        this.stopEffects(.025);
        this.duckUntil = time + 1.1;
        this.refreshMusicVolume();
        this.noise(time, .5, { gain: options.reason === 'ice' ? .22 : .10, filter: options.reason === 'ice' ? 'highpass' : 'lowpass', cutoff: options.reason === 'ice' ? 1900 : 700, endCutoff: 250 });
        this.tone(57, time + .03, .65, { endNote: 33, gain: .15, type: 'triangle', cutoff: 1200 });
        [62,58,57].forEach((note, i) => this.tone(note, time + .18 + i * .19, .45, { gain: .10 }));
      } else if (kind === 'win') {
        this.stopEffects(.025);
        this.duckUntil = time + (options.final ? 3.2 : 2.2);
        this.refreshMusicVolume();
        [74,78,81,86].forEach((note, i) => this.tone(note, time + i * .15, 1, { gain: .14, pan: (i - 1.5) * .14 }));
        [62,66,69,74].forEach(note => this.tone(note, time + .55, 1.5, { gain: .055, attack: .04 }));
        this.tone(93, time + .85, 1.1, { gain: .065 });
        if (options.final) [86,88,90,93,98].forEach((note, i) => this.tone(note, time + 1.15 + i * .16, 1.25, { gain: .10 }));
      }
    }

    pause() {
      this.paused = true;
      this.stopMusic(.02);
      this.stopEffects(.02);
      this.refreshMusicVolume();
      if (this.context && this.context.state !== 'closed') {
        this.context.suspend().then(() => {
          if (!this.paused && !document.hidden) this.unlock();
        }).catch(() => {});
      }
    }

    resume() {
      this.paused = false;
      if (this.engaged) this.unlock();
    }
  }

  window.RollAudio = GameAudio;
})();
