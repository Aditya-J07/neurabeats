/**
 * Calming Web Audio & Speech Engine for NeuroBeat
 * Designed for low latency, offline operation, and soothing therapeutic timbre.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.currentInstrument = 'bell'; // 'bell', 'piano', 'drum', 'wood', 'metronome'
    this.isMuted = false;
    this.voiceEnabled = true;
  }

  initContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBeat(instrument = this.currentInstrument, isDownbeat = false) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    switch (instrument) {
      case 'bell':
        this.playSoftBell(t, isDownbeat);
        break;
      case 'piano':
        this.playWarmPiano(t, isDownbeat);
        break;
      case 'drum':
        this.playSoftDrum(t, isDownbeat);
        break;
      case 'wood':
        this.playWoodBlock(t, isDownbeat);
        break;
      default:
        this.playGentleMetronome(t, isDownbeat);
        break;
    }
  }

  // Soft Bell / Healing Chime (Sine wave harmonics)
  playSoftBell(t, isDownbeat) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isDownbeat ? 528 : 440, t); // 528Hz healing solfeggio tone on downbeat

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.75);
  }

  // Warm Acoustic Piano Note
  playWarmPiano(t, isDownbeat) {
    const fundamental = isDownbeat ? 261.63 : 329.63; // C4 or E4
    
    // 2 detuned oscillators for rich acoustic body
    [0, 3].forEach((detune) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(fundamental, t);
      osc.detune.setValueAtTime(detune, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  // Soft Membrane Percussion (deep gentle thud for step cueing)
  playSoftDrum(t, isDownbeat) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startFreq = isDownbeat ? 130 : 105;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.36);
  }

  // Organic Wood Block
  playWoodBlock(t, isDownbeat) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isDownbeat ? 900 : 750, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.06);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  // Gentle Metronome Click (filtered, non-jarring)
  playGentleMetronome(t, isDownbeat) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isDownbeat ? 680 : 520, t);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  // 432Hz Soothing Ambient Wave for 30-Second Rest Break
  playCalmAmbientWave() {
    this.initContext();
    if (!this.ctx) return null;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(432, t); // Calming 432Hz tone

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 1.5);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);

    return {
      stop: () => {
        const stopTime = this.ctx.currentTime;
        gain.gain.linearRampToValueAtTime(0.0001, stopTime + 1.0);
        setTimeout(() => {
          try { osc.stop(); } catch(e) {}
        }, 1100);
      }
    };
  }

  // Warm voice cue speaking gently to patient
  speakCue(phrase) {
    if (!this.voiceEnabled) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Don't stack speech
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.rate = 0.9; // Soft, measured pace
      utterance.pitch = 1.0;
      utterance.volume = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  }
}

export const soundEngine = new SoundEngine();
