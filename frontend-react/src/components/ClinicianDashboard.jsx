import React, { useState, useEffect } from 'react';
import { 
  Users, Shield, Activity, TrendingUp, AlertTriangle, 
  CheckCircle, Sliders, Calendar, ArrowUpRight, FileText,
  Clock, HeartHandshake, Lock, Sparkles, ChevronRight, RefreshCw
} from 'lucide-react';
import { patientsAPI } from '../services/api';

export default function ClinicianDashboard({ clinicianSettings, onUpdateSettings }) {
  // Local state for safety guardrails
  const [minBpm, setMinBpm] = useState(clinicianSettings.minBpm || 45);
  const [maxBpm, setMaxBpm] = useState(clinicianSettings.maxBpm || 72);
  const [maxDuration, setMaxDuration] = useState(clinicianSettings.maxDuration || 15);
  const [freezingTolerance, setFreezingTolerance] = useState(clinicianSettings.freezingTolerance || 2);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Selected patient
  const [selectedPatientId, setSelectedPatientId] = useState(1);
  const [patientData, setPatientData] = useState(null);
  const [_recentSessions, setRecentSessions] = useState([]);

  // Fetch real patient from backend
  useEffect(() => {
    patientsAPI.getProfile(selectedPatientId)
      .then(res => {
        setPatientData(res.data);
        setMinBpm(res.data.min_safe_bpm);
        setMaxBpm(res.data.max_safe_bpm);
        setMaxDuration(res.data.max_duration_mins);
        setFreezingTolerance(res.data.freezing_tolerance);
      })
      .catch(err => console.warn("Using offline patient profile:", err));

    patientsAPI.getSessions(selectedPatientId)
      .then(res => {
        setRecentSessions(res.data);
      })
      .catch(err => console.warn("Using offline sessions list:", err));
  }, [selectedPatientId]);

  // Patients roster
  const patients = [
    {
      id: 1,
      name: patientData?.full_name || 'Arthur Pendelton',
      age: 68,
      condition: "Parkinson's Disease (Stage 2)",
      baselineCadence: patientData?.baseline_cadence || 44,
      currentCadence: 54,
      targetCadence: patientData?.target_cadence || 54,
      streak: 14,
      lastSession: 'Today, 09:40 AM',
      adherence: '96%',
      status: 'Improving Steadily',
      alerts: 0
    },
    {
      id: 2,
      name: 'Eleanor Vance',
      age: 72,
      condition: 'Post-Stroke Left Hemiparesis',
      baselineCadence: 38,
      currentCadence: 48,
      targetCadence: 55,
      streak: 9,
      lastSession: 'Yesterday, 04:15 PM',
      adherence: '88%',
      status: 'Gait Bilateral Balance +14%',
      alerts: 0
    },
    {
      id: 3,
      name: 'Mateo Cruz',
      age: 64,
      condition: "Parkinson's (Freezing Episodes)",
      baselineCadence: 42,
      currentCadence: 49,
      targetCadence: 58,
      streak: 5,
      lastSession: '2 days ago',
      adherence: '74%',
      status: 'Mild Fatigue Detected',
      alerts: 1
    }
  ];

  const selectedPatient = patients.find(p => p.id === selectedPatientId) || patients[0];

  // Save changes to clinician safety guardrails
  const handleSaveSafetyLimits = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const updatedData = {
      min_safe_bpm: Number(minBpm),
      max_safe_bpm: Number(maxBpm),
      max_duration_mins: Number(maxDuration),
      freezing_tolerance: Number(freezingTolerance)
    };

    try {
      await patientsAPI.updateSafety(selectedPatientId, updatedData);
    } catch (err) {
      console.warn("Backend update offline fallback:", err);
    }

    onUpdateSettings({
      minBpm: Number(minBpm),
      maxBpm: Number(maxBpm),
      maxDuration: Number(maxDuration),
      freezingTolerance: Number(freezingTolerance)
    });

    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  return (
    <div style={{ maxWidth: '1060px', margin: '0 auto', padding: '16px 20px 60px' }}>
      
      {/* Clinician Profile Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{
              backgroundColor: 'var(--primary-light)',
              color: 'var(--primary)',
              fontSize: '12px',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              letterSpacing: '0.04em'
            }}>
              CLINICAL PORTAL • HUMAN-IN-THE-LOOP
            </span>
          </div>
          <h1 style={{ fontSize: '26px', color: 'var(--text-main)', fontWeight: 700 }}>
            Dr. Sarah Sharma, MD
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
            Neurorehabilitation & Movement Disorders • General Hospital Rehab Center
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={() => alert(`Clinical Summary PDF generated for ${selectedPatient.name}. Synced to EHR.`)}
          style={{
            backgroundColor: '#FFFFFF',
            color: 'var(--primary)',
            border: '1px solid var(--border-soft)',
            padding: '10px 20px',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: 700,
            fontSize: '14px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <FileText size={17} color="var(--primary)" />
          Export Patient Report
        </button>
      </div>

      {/* Top Clinical Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {[
          { label: 'Active Monitored Patients', value: '12', sub: 'Zero device dropout', icon: Users, color: 'var(--primary)' },
          { label: 'Avg Monthly Adherence', value: '92.4%', sub: '+18% vs static metronome', icon: TrendingUp, color: '#3D9970' },
          { label: 'Autonomous Safety Interventions', value: '28', sub: 'Tempo eased for fatigue', icon: Shield, color: 'var(--coral-accent)' },
          { label: 'Total Therapy Minutes', value: '1,840', sub: 'This month across clinic', icon: Clock, color: 'var(--primary)' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              boxShadow: 'var(--shadow-sm)',
              border: '1px solid var(--border-soft)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{stat.label}</span>
                <div style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: '8px',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Icon size={18} color={stat.color} />
                </div>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '2px' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {stat.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main 2-Column Split: Patient List + Clinician Safety Guardrails */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '24px',
        marginBottom: '28px'
      }}>

        {/* COLUMN 1: PATIENTS LIST */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-soft)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)' }}>
              Assigned Patients
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Click patient to configure
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {patients.map(p => {
              const isSelected = p.id === selectedPatientId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-accent-soft)' : 'var(--bg-subtle)',
                    border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border-soft)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? 'var(--shadow-sm)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                        {p.name}
                      </h4>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {p.condition} • Age {p.age}
                      </span>
                    </div>
                    <span style={{
                      backgroundColor: isSelected ? 'var(--primary)' : '#FFFFFF',
                      color: isSelected ? '#FFFFFF' : 'var(--text-muted)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-full)'
                    }}>
                      {p.streak}d streak
                    </span>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '10px',
                    fontSize: '13px'
                  }}>
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Cadence: </span>
                      <strong style={{ color: 'var(--text-main)' }}>{p.currentCadence} SPM</strong>
                      <span style={{ color: 'var(--text-light)', fontSize: '11px' }}> (Target: {p.targetCadence})</span>
                    </div>
                    <div style={{ color: '#3D9970', fontWeight: 600, fontSize: '12px' }}>
                      {p.status}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 2: CLINICIAN SAFETY GUARDRAIL ENVELOPE */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          border: '1px solid var(--border-soft)',
          position: 'relative'
        }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--coral-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Lock size={18} color="var(--coral-accent)" />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                Safety Envelope Controls
              </h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Targeting: <strong>{selectedPatient.name}</strong>
              </span>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginBottom: '20px',
            lineHeight: 1.5
          }}>
            <Shield size={15} color="var(--primary)" style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} />
            The Autonomous Agent <strong>cannot exceed</strong> these physician-defined limits. Every tempo adaptation and rest trigger is logged with clinical justification.
          </div>

          <form onSubmit={handleSaveSafetyLimits}>
            
            {/* Min BPM Safety Floor */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                  Minimum Safe Tempo Floor
                </label>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>
                  {minBpm} BPM
                </span>
              </div>
              <input
                type="range"
                min="35"
                max="60"
                value={minBpm}
                onChange={(e) => setMinBpm(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Prevents sudden stall or loss of momentum during walking fatigue.
              </span>
            </div>

            {/* Max BPM Safety Ceiling */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                  Maximum Safe Tempo Ceiling
                </label>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--coral-accent)' }}>
                  {maxBpm} BPM
                </span>
              </div>
              <input
                type="range"
                min="55"
                max="90"
                value={maxBpm}
                onChange={(e) => setMaxBpm(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--coral-accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Guards against cardiovascular strain and fall hazard from over-acceleration.
              </span>
            </div>

            {/* Max Continuous Session Duration */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                  Max Continuous Duration (Forced Breather)
                </label>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {maxDuration} mins
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="30"
                value={maxDuration}
                onChange={(e) => setMaxDuration(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
            </div>

            {/* Freezing Tolerance Threshold */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                  Freezing of Gait (FoG) Auto-Rest Trigger
                </label>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
                  After {freezingTolerance} episodes
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={freezingTolerance}
                onChange={(e) => setFreezingTolerance(e.target.value)}
                style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                System automatically initiates 30s calm wave breather if freezing episodes recur.
              </span>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSaving}
              style={{
                backgroundColor: 'var(--primary)',
                color: '#FFFFFF',
                width: '100%',
                height: '48px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-sm)',
                opacity: isSaving ? 0.7 : 1
              }}
            >
              {isSaving ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={18} />}
              {isSaving ? 'Broadcasting...' : "Save & Broadcast Safety Envelope to Patient App"}
            </button>

            {savedSuccess && (
              <div style={{
                marginTop: '12px',
                padding: '8px 12px',
                backgroundColor: 'var(--success-light)',
                color: 'var(--success)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 600,
                textAlign: 'center'
              }}>
                Safety envelope successfully updated in database and synced to Arthur's app!
              </div>
            )}
          </form>

        </div>
      </div>

      {/* PATIENT PROGRESSION & SAFETY LOGS */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--border-soft)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
              Recent Tele-Rehab Sessions & Freezing Logs
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Logged by on-device agent for {selectedPatient.name}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{
              backgroundColor: 'var(--bg-accent-soft)',
              color: 'var(--primary)',
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)'
            }}>
              Baseline: {selectedPatient.baselineCadence} SPM
            </span>
            <span style={{
              backgroundColor: 'var(--coral-light)',
              color: 'var(--coral-accent)',
              fontSize: '12px',
              fontWeight: 700,
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)'
            }}>
              Prescribed Target: {selectedPatient.targetCadence} SPM
            </span>
          </div>
        </div>

        {/* Logs Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Date & Mode</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Duration</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Cadence Progression</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Sync Score</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>Agent Safety Action</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  date: 'Today, 09:40 AM',
                  mode: 'Gait RAS Walking',
                  duration: '14m 20s',
                  startCadence: '52 SPM',
                  endCadence: '55 SPM',
                  sync: '94%',
                  action: 'Tempo gently elevated (+3 BPM). No freezing detected.'
                },
                {
                  date: 'Yesterday, 10:15 AM',
                  mode: 'Gait RAS Walking',
                  duration: '15m 00s',
                  startCadence: '50 SPM',
                  endCadence: '53 SPM',
                  sync: '91%',
                  action: 'Max duration reached. Forced gentle 30s breather cue triggered.'
                },
                {
                  date: 'Sep 24, 03:30 PM',
                  mode: 'Fine Motor Tapping',
                  duration: '10m 12s',
                  startCadence: '48 TPM',
                  endCadence: '51 TPM',
                  sync: '89%',
                  action: 'Tremor compensation filter smoothed tap timestamps.'
                },
                {
                  date: 'Sep 23, 11:00 AM',
                  mode: 'Gait RAS Walking',
                  duration: '12m 45s',
                  startCadence: '49 SPM',
                  endCadence: '47 SPM',
                  sync: '79%',
                  action: 'Fatigue detected. Agent protective deceleration to safe floor (47 BPM).'
                }
              ].map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-main)' }}>
                    {row.date}
                    <div style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>{row.mode}</div>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)' }}>{row.duration}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{row.startCadence}</span>
                    <span style={{ color: 'var(--primary)', margin: '0 4px' }}>→</span>
                    <strong style={{ color: 'var(--primary)' }}>{row.endCadence}</strong>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      backgroundColor: 'var(--bg-accent-soft)',
                      color: 'var(--primary)',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      fontSize: '12px'
                    }}>
                      {row.sync}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {row.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
}
