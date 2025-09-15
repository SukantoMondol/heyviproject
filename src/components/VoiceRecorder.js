import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { voiceSearch } from '../services/apiService';
import { useLanguage } from '../context/LanguageContext';
import './VoiceRecorder.css';

const VoiceRecorder = ({ isOpen, onClose, onSearchResults }) => {
  const { t } = useLanguage();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setTranscript('');
      setRecordingTime(0);
      // Lock page scroll while overlay is open
      try {
        document.body.classList.add('voice-recorder-scroll-lock');
      } catch (_) {}
    } else {
      // Unlock page scroll when overlay is closed
      try {
        document.body.classList.remove('voice-recorder-scroll-lock');
      } catch (_) {}
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      // Clean up scroll lock on unmount
      try {
        document.body.classList.remove('voice-recorder-scroll-lock');
      } catch (_) {}
    };
  }, []);

  const startRecording = async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000, // Use 16kHz for better speech recognition
          channelCount: 1 // Mono audio is better for speech recognition
        } 
      });
      
      // Try different audio formats in order of preference for speech recognition
      // Prioritize formats that work well with speech recognition APIs
      const mimeTypes = [
        'audio/wav', // Best for speech recognition
        'audio/mp4',
        'audio/m4a', 
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mpeg',
        'audio/mp3',
        'audio/ogg'
      ];
      
      let selectedMimeType = null;
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      if (!selectedMimeType) {
        throw new Error('No supported audio format found');
      }
      
      console.log('Using audio format:', selectedMimeType);
      
      // Log all supported formats for debugging
      console.log('Supported audio formats:');
      mimeTypes.forEach(type => {
        console.log(`${type}: ${MediaRecorder.isTypeSupported(type)}`);
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: selectedMimeType
      });

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        // Determine the correct file extension based on MIME type
        let fileExtension = 'webm';
        let fileType = 'audio/webm';
        
        if (selectedMimeType.includes('mp4') || selectedMimeType.includes('m4a')) {
          fileExtension = 'm4a';
          fileType = 'audio/m4a';
        } else if (selectedMimeType.includes('wav')) {
          fileExtension = 'wav';
          fileType = 'audio/wav';
        } else if (selectedMimeType.includes('mp3') || selectedMimeType.includes('mpeg')) {
          fileExtension = 'mp3';
          fileType = 'audio/mpeg';
        } else if (selectedMimeType.includes('ogg')) {
          fileExtension = 'ogg';
          fileType = 'audio/ogg';
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: fileType });
        
        // If we're using WebM format, try to force it as audio/webm instead of video/webm
        if (fileType === 'audio/webm') {
          // Create a new blob with explicit audio/webm type to override browser detection
          const audioWebmBlob = new Blob([audioBlob], { type: 'audio/webm' });
          await processAudio(audioWebmBlob, 'webm', 'audio/webm');
        } else {
          await processAudio(audioBlob, fileExtension, fileType);
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      
      // Start timer
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsRecording(false);
  };

  const processAudio = async (audioBlob, fileExtension, fileType) => {
    try {
      setIsProcessing(true);
      setError(null);
      
      let finalAudioBlob = audioBlob;
      let finalFileExtension = 'wav';
      let finalFileType = 'audio/wav';
      
      // Always convert to WAV format for better speech recognition quality
      if (fileType !== 'audio/wav') {
        try {
          console.log(`Converting ${fileType} to WAV format for better speech recognition...`);
          finalAudioBlob = await convertToWav(audioBlob);
          console.log('Conversion successful');
        } catch (conversionError) {
          console.error('Audio conversion failed:', conversionError);
          // Fall back to original format but still try to use WAV extension
          finalFileExtension = fileExtension;
          finalFileType = fileType;
        }
      }
      
      // Convert blob to file
      const audioFile = new File([finalAudioBlob], `voice-recording.${finalFileExtension}`, {
        type: finalFileType
      });

      // Call voice search API
      const result = await voiceSearch(audioFile, { limit: 20 });
      
      console.log('Voice search API response:', result);
      
      if (result.status === 'success') {
        setTranscript(result.transcript || '');
        
        // Log the search results structure for debugging
        console.log('Voice search results structure:', {
          status: result.status,
          transcript: result.transcript,
          hasData: !!result.data,
          dataType: typeof result.data,
          collections: result.data?.collections?.length || 0,
          elements: result.data?.elements?.length || 0,
          fullResult: result
        });
        
        // Automatically close the overlay and show search results
        setTimeout(() => {
          onSearchResults(result);
          onClose(); // Close the overlay
        }, 500); // Small delay to show the transcript briefly
      } else {
        throw new Error(result.error || 'Voice search failed');
      }
      
    } catch (error) {
      console.error('Error processing audio:', error);
      setError(error.message || 'Failed to process voice recording');
    } finally {
      setIsProcessing(false);
    }
  };

  // Convert any audio format to WAV format using Web Audio API
  const convertToWav = async (audioBlob) => {
    return new Promise((resolve, reject) => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const fileReader = new FileReader();
      
      fileReader.onload = async (event) => {
        try {
          const arrayBuffer = event.target.result;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Create WAV file from audio buffer
          const wavBlob = audioBufferToWav(audioBuffer);
          resolve(wavBlob);
        } catch (error) {
          reject(error);
        }
      };
      
      fileReader.onerror = reject;
      fileReader.readAsArrayBuffer(audioBlob);
    });
  };

  // Convert AudioBuffer to WAV format
  const audioBufferToWav = (buffer) => {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="voice-recorder-overlay">
      <div className="voice-recorder-modal">
        <div className="voice-recorder-header">
          <h2>{t('voiceSearch')}</h2>
          <button className="close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="voice-recorder-content">
          {error && (
            <div className="error-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                <path d="M15 9L9 15M9 9L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          {transcript && (
            <div className="transcript-section">
              <h3>{t('transcript')}</h3>
              <p className="transcript-text">{transcript}</p>
              <p className="transcript-hint">{t('closingOverlay')}</p>
            </div>
          )}

          <div className="recording-section">
            {!isRecording && !isProcessing && (
              <div className="recording-instructions">
                <div className="mic-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                    <path d="M12 1A3 3 0 0 0 9 4V10A3 3 0 0 0 12 13A3 3 0 0 0 15 10V4A3 3 0 0 0 12 1Z" stroke="currentColor" strokeWidth="2"/>
                    <path d="M19 10V13A7 7 0 0 1 5 13V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 19V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M8 23H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p>{t('tapToStartRecording')}</p>
                <p className="recording-hint">{t('speakYourSearchQuery')}</p>
              </div>
            )}

            {isRecording && (
              <div className="recording-active">
                <div className="recording-indicator">
                  <div className="pulse-ring"></div>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M12 1A3 3 0 0 0 9 4V10A3 3 0 0 0 12 13A3 3 0 0 0 15 10V4A3 3 0 0 0 12 1Z" fill="#FF6407" stroke="#FF6407" strokeWidth="2"/>
                    <path d="M19 10V13A7 7 0 0 1 5 13V10" stroke="#FF6407" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M12 19V23" stroke="#FF6407" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M8 23H16" stroke="#FF6407" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="recording-time">{formatTime(recordingTime)}</p>
                <p>{t('recording')}</p>
              </div>
            )}

            {isProcessing && (
              <div className="processing">
                <div className="spinner"></div>
                <p>{t('processingAudio')}</p>
              </div>
            )}
          </div>

          <div className="voice-recorder-actions">
            {!isRecording && !isProcessing && (
              <button 
                className="record-button"
                onClick={startRecording}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M12 1A3 3 0 0 0 9 4V10A3 3 0 0 0 12 13A3 3 0 0 0 15 10V4A3 3 0 0 0 12 1Z" stroke="currentColor" strokeWidth="2"/>
                  <path d="M19 10V13A7 7 0 0 1 5 13V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M12 19V23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M8 23H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {t('startRecording')}
              </button>
            )}

            {isRecording && (
              <button 
                className="stop-button"
                onClick={stopRecording}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect x="6" y="6" width="12" height="12" fill="currentColor"/>
                </svg>
                {t('stopRecording')}
              </button>
            )}

            {transcript && !isProcessing && (
              <button 
                className="search-again-button"
                onClick={() => {
                  setTranscript('');
                  setRecordingTime(0);
                }}
              >
                {t('searchAgain')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VoiceRecorder;
