/**
 * NuroMotionPanel Component
 * Complete judge-demo ready interface: Camera feed, skeleton overlay,
 * session controls (Start/Pause/Stop/Reset), movement metrics, and collapsible diagnostics.
 */

import React, { useState } from 'react';
import { 
  Play, Pause, Square, RotateCcw, Video, Sparkles, 
  ChevronDown, ChevronUp, Cpu, Activity, ShieldCheck 
} from 'lucide-react';
import CameraView from './CameraView';
import MovementMetrics from './MovementMetrics';
import AudioStatus from './AudioStatus';

export default function NuroMotionPanel({
  videoRef,
  canvasRef,
  landmarksData,
  isRunning,
  isPaused,
  isDemoMode,
  trackingState,
  confidence,
  framing = null,
  metrics,
  audioState,
  diagnostics,
  lastStep,
  errorMessage,
  onStartCamera,
  onStartDemo,
  onPause,
  onResume,
  onStop,
  onReset,
  targetBpm = 60,
}) {

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [sensingSource, setSensingSource] = useState('camera'); // 'camera' or 'demo'

  const handleStart = () => {
    if (sensingSource === 'camera') {
      onStartCamera(targetBpm);
    } else {
      onStartDemo(targetBpm);
    }
  };

  const handleToggleSource = (source) => {
    setSensingSource(source);
    if (isRunning) {
      if (source === 'camera') {
        onStartCamera(targetBpm);
      } else {
        onStartDemo(targetBpm);
      }
    }
  };

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      borderRadius: '16px',
      border: '1px solid #E2E8F0',
      padding: '20px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      marginBottom: '24px',
    }}>
      {/* Top Header & Mode Selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={22} color="#0D9488" />
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0F172A' }}>
              Real-Time Movement & Rhythm Tracking
            </h3>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              Browser-Side Inference • MediaPipe Pose Landmarker FULL (33 Keypoints)
            </span>
          </div>
        </div>

        {/* Source Toggle: Webcam vs Demo */}
        <div style={{
          display: 'flex',
          backgroundColor: '#F1F5F9',
          padding: '3px',
          borderRadius: '999px',
          border: '1px solid #E2E8F0',
        }}>
          <button
            onClick={() => handleToggleSource('camera')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              backgroundColor: sensingSource === 'camera' ? '#0D9488' : 'transparent',
              color: sensingSource === 'camera' ? '#FFFFFF' : '#64748B',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Video size={14} />
            Laptop Camera
          </button>

          <button
            onClick={() => handleToggleSource('demo')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              border: 'none',
              backgroundColor: sensingSource === 'demo' ? '#0D9488' : 'transparent',
              color: sensingSource === 'demo' ? '#FFFFFF' : '#64748B',
              padding: '6px 14px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={14} />
            Demo Mode
          </button>
        </div>
      </div>

      {/* Live Webcam, Silhouette Guide & Skeleton View */}
      <CameraView
        videoRef={videoRef}
        canvasRef={canvasRef}
        landmarksData={landmarksData}
        trackingState={trackingState}
        confidence={confidence}
        framing={framing}
        lastStep={lastStep}
        isDemoMode={isDemoMode}
        fps={diagnostics.poseFps}
        latencyMs={diagnostics.latencyMs}
        errorMessage={errorMessage}
        onSwitchToDemo={() => handleToggleSource('demo')}
      />


      {/* Movement Metrics Cards */}
      <MovementMetrics
        cadenceSpm={metrics.cadenceSpm}
        leftSteps={metrics.leftSteps}
        rightSteps={metrics.rightSteps}
        totalSteps={metrics.totalSteps}
        balanceScore={metrics.balanceScore}
        qualityScore={metrics.qualityScore}
        timingErrorMs={metrics.timingErrorMs}
      />

      {/* Audio Status */}
      <AudioStatus
        level={audioState.level}
        activity={audioState.activity}
        timingErrorMs={metrics.timingErrorMs}
        isListening={isRunning}
      />

      {/* Session Controls: START / PAUSE / STOP / RESET */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        marginTop: '16px',
        flexWrap: 'wrap',
      }}>
        {!isRunning ? (
          <button
            onClick={handleStart}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#0D9488',
              color: '#FFFFFF',
              border: 'none',
              padding: '12px 28px',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
              transition: 'transform 0.1s ease',
            }}
          >
            <Play size={18} fill="#FFFFFF" />
            START TRACKING SESSION
          </button>
        ) : (
          <>
            {isPaused ? (
              <button
                onClick={onResume}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#10B981',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Play size={16} fill="#FFFFFF" />
                Resume
              </button>
            ) : (
              <button
                onClick={onPause}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#F59E0B',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Pause size={16} fill="#FFFFFF" />
                Pause
              </button>
            )}

            <button
              onClick={onStop}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Square size={16} fill="#FFFFFF" />
              Stop
            </button>
          </>
        )}

        <button
          onClick={onReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#F1F5F9',
            color: '#475569',
            border: '1px solid #CBD5E1',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RotateCcw size={16} />
          Reset Metrics
        </button>
      </div>

      {/* Collapsible Diagnostics Section */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            background: 'none',
            border: 'none',
            color: '#64748B',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={14} />
            Diagnostics & Inference Telemetry
          </span>
          {showDiagnostics ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showDiagnostics && (
          <div style={{
            marginTop: '10px',
            backgroundColor: '#0F172A',
            color: '#E2E8F0',
            padding: '14px',
            borderRadius: '10px',
            fontSize: '12px',
            fontFamily: 'monospace',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
          }}>
            <div>
              <span style={{ color: '#94A3B8' }}>Model: </span>
              <strong style={{ color: '#38BDF8' }}>{diagnostics.modelName}</strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Tracking State: </span>
              <strong style={{ color: '#10B981' }}>{trackingState}</strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Camera FPS: </span>
              <strong>{diagnostics.cameraFps}</strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Pose Inference FPS: </span>
              <strong>{diagnostics.poseFps}</strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Latency: </span>
              <strong>{diagnostics.latencyMs} ms</strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Dropped Frames: </span>
              <strong>{diagnostics.droppedFrames}</strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Temporal Filter: </span>
              <span style={{ color: '#A7F3D0' }}>One Euro Filter (Adaptive)</span>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Framing Guide: </span>
              <strong style={{ color: framing?.isOptimallyFramed ? '#10B981' : '#F59E0B' }}>
                {framing?.feedback || 'Optimally Framed'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Feet Visibility: </span>
              <strong style={{ color: framing?.feetVisible ? '#10B981' : '#EF4444' }}>
                {framing?.feetVisible ? 'CLEAR' : 'OCCLUDED / CLIPPED'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#94A3B8' }}>Normalization: </span>
              <span style={{ color: '#A7F3D0' }}>Pelvis-Centered / Torso-Scaled</span>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
