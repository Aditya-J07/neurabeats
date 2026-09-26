import React, { useState } from 'react';
import Navbar from './components/Navbar';
import PatientScreen from './components/PatientScreen';
import ClinicianDashboard from './components/ClinicianDashboard';

export default function App() {
  const [activeView, setActiveView] = useState('patient'); // 'patient' or 'clinician'
  
  // Clinician Safety Limits (Human-In-The-Loop state)
  const [clinicianSettings, setClinicianSettings] = useState({
    minBpm: 45,
    maxBpm: 72,
    maxDuration: 15,
    freezingTolerance: 2
  });

  const handleUpdateClinicianSettings = (newSettings) => {
    setClinicianSettings(newSettings);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navigation */}
      <Navbar activeView={activeView} setActiveView={setActiveView} />

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '24px 0' }}>
        {activeView === 'patient' ? (
          <PatientScreen clinicianSettings={clinicianSettings} />
        ) : (
          <ClinicianDashboard 
            clinicianSettings={clinicianSettings} 
            onUpdateSettings={handleUpdateClinicianSettings} 
          />
        )}
      </main>

      {/* Soothing Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-soft)',
        backgroundColor: '#FFFFFF',
        padding: '24px 20px',
        textAlign: 'center',
        fontSize: '13px',
        color: 'var(--text-muted)'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong>NeuroBeat</strong> • AI-Driven Rhythmic Neurorehabilitation for Parkinson's & Stroke
          </div>
          <div>
            Build for Billions • Team <strong>String Coders</strong> (Aditya Jha, Anushka, Tanuj Nayak G, Chetan)
          </div>
        </div>
      </footer>
    </div>
  );
}
