import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import './QRScanner.css';
import { useLanguage } from '../context/LanguageContext';

const QRScanner = ({ isOpen, onClose, onScan }) => {
  const { t } = useLanguage();
  const [error, setError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const scannerRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaTrackRef = useRef(null);
  const streamRef = useRef(null);

  const getMediaTrack = useCallback(async () => {
    try {
      if (scannerRef.current) {
        const videoElement = document.querySelector('#qr-reader video');
        if (videoElement && videoElement.srcObject) {
          const stream = videoElement.srcObject;
          streamRef.current = stream;
          const tracks = stream.getVideoTracks();
          if (tracks.length > 0) {
            mediaTrackRef.current = tracks[0];
            return mediaTrackRef.current;
          }
        }
      }
    } catch (error) {
      console.warn('Error getting media track:', error);
    }
    return null;
  }, []);

  const applyTorch = useCallback(async (enabled) => {
    try {
      const track = await getMediaTrack();
      if (!track) return;

      const capabilities = track.getCapabilities();
      if (capabilities && capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: enabled }]
        });
        setTorchOn(enabled);
      }
    } catch (error) {
      console.warn('Error applying torch:', error);
    }
  }, [getMediaTrack]);

  const applyZoom = useCallback(async (value) => {
    try {
      const track = await getMediaTrack();
      if (!track) return;

      const capabilities = track.getCapabilities();
      if (capabilities && capabilities.zoom) {
        const clampedValue = Math.min(capabilities.zoom.max, Math.max(capabilities.zoom.min, value));
        await track.applyConstraints({
          advanced: [{ zoom: clampedValue }]
        });
        setZoom(clampedValue);
      } else {
        setZoom(value);
      }
    } catch (error) {
      console.warn('Error applying zoom:', error);
    }
  }, [getMediaTrack]);

  const cleanupScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (e) {
        console.warn('Error during scanner cleanup:', e);
      }
    }
    
    const qrReaderElement = document.getElementById('qr-reader');
    if (qrReaderElement) {
      qrReaderElement.innerHTML = '';
    }
    
    mediaTrackRef.current = null;
    streamRef.current = null;
    setIsScanning(false);
  }, []);

  const handleClose = useCallback(() => {
    cleanupScanner();
    setError(null);
    setTorchOn(false);
    setZoom(1);
    try { document.body.classList.remove('qr-scroll-lock'); } catch (_) {}
    onClose();
  }, [cleanupScanner, onClose]);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    setError(null);
    setIsScanning(true);

    // Lock page scroll and ensure overlay sits above any app containers
    try {
      document.body.classList.add('qr-scroll-lock');
    } catch (_) {}

    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode("qr-reader");
        
        const devices = await Html5Qrcode.getCameras();
        
        if (devices && devices.length > 0) {
          let cameraId = devices[0].id;
          
          const backCamera = devices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment') ||
            (!device.label.toLowerCase().includes('front') && !device.label.toLowerCase().includes('user'))
          );
          
          const frontCamera = devices.find(device => 
            device.label.toLowerCase().includes('front') || 
            device.label.toLowerCase().includes('user')
          );
          
          if (facingMode === 'environment' && backCamera) {
            cameraId = backCamera.id;
          } else if (facingMode === 'user' && frontCamera) {
            cameraId = frontCamera.id;
          } else {
            cameraId = backCamera ? backCamera.id : devices[0].id;
          }
          
          const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            disableFlip: false
          };

          await html5QrCode.start(
            { deviceId: cameraId },
            config,
            (decodedText, decodedResult) => {
              onScan(decodedText);
              handleClose();
            },
            (errorMessage) => {
              if (!errorMessage.includes('NotFound') && !errorMessage.includes('NotAllowed')) {
                console.log(`Scan error: ${errorMessage}`);
              }
            }
          );

          scannerRef.current = html5QrCode;
          
          setTimeout(async () => {
            await getMediaTrack();
          }, 500);
        } else {
          throw new Error('No cameras found');
        }
      } catch (error) {
        if (error.message.includes('NotAllowedError') || error.message.includes('Permission denied')) {
          setError(new Error(t('cameraPermissionDenied')));
        } else if (error.message.includes('NotFoundError') || error.message.includes('No cameras found')) {
          setError(new Error(t('noCameraFound')));
        } else if (error.message.includes('NotSupportedError')) {
          setError(new Error(t('cameraNotSupported')));
        } else if (error.message.includes('NotReadableError')) {
          setError(new Error(t('cameraInUse')));
        } else if (error.message.includes('OverconstrainedError')) {
          setError(new Error(t('cameraConstraintsNotMet')));
        } else {
          setError(new Error(`${t('failedToStartCamera')}: ${error.message}`));
        }
      }
    };

    setTimeout(startScanner, 100);

    return () => {
      cleanupScanner();
      try { document.body.classList.remove('qr-scroll-lock'); } catch (_) {}
    };
  }, [isOpen, onScan, handleClose, cleanupScanner, facingMode, getMediaTrack, t]);

  useEffect(() => {
    if (!isOpen || !isScanning) return;

    const checkMediaTrack = async () => {
      if (!mediaTrackRef.current) {
        await getMediaTrack();
      }
    };

    const interval = setInterval(checkMediaTrack, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isScanning, getMediaTrack]);

  useEffect(() => {
    return () => {
      cleanupScanner();
      try { document.body.classList.remove('qr-scroll-lock'); } catch (_) {}
    };
  }, [cleanupScanner]);

  // removed unused handleError

  const toggleFacingMode = async () => {
    setError(null);
    setIsSwitchingCamera(true);
    
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }
      
      mediaTrackRef.current = null;
      streamRef.current = null;
      setTorchOn(false);
      setZoom(1);
      
      const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(newFacingMode);
      
      setTimeout(async () => {
        try {
          const qrReaderElement = document.getElementById('qr-reader');
          if (!qrReaderElement) {
            throw new Error('QR reader element not found in DOM');
          }
          
          qrReaderElement.innerHTML = '';
          
          const html5QrCode = new Html5Qrcode("qr-reader");
          
          const devices = await Html5Qrcode.getCameras();
          
          if (devices && devices.length > 0) {
            const backCamera = devices.find(device => 
              device.label.toLowerCase().includes('back') || 
              device.label.toLowerCase().includes('rear') ||
              device.label.toLowerCase().includes('environment') ||
              (!device.label.toLowerCase().includes('front') && !device.label.toLowerCase().includes('user'))
            );
            
            const frontCamera = devices.find(device => 
              device.label.toLowerCase().includes('front') || 
              device.label.toLowerCase().includes('user')
            );
            
            let cameraId;
            if (newFacingMode === 'environment' && backCamera) {
              cameraId = backCamera.id;
            } else if (newFacingMode === 'user' && frontCamera) {
              cameraId = frontCamera.id;
            } else {
              if (devices.length === 1) {
                cameraId = devices[0].id;
                setError(new Error(t('onlyOneCameraAvailable')));
                setIsSwitchingCamera(false);
                return;
              } else {
                const alternativeCamera = devices.find(d => d.id !== devices[0].id);
                if (alternativeCamera) {
                  cameraId = alternativeCamera.id;
                } else {
                  cameraId = devices[0].id;
                }
              }
            }
            
            if (!cameraId) {
              throw new Error(t('noSuitableCameraFound'));
            }
            
            const config = {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
              disableFlip: false
            };

            await html5QrCode.start(
              { deviceId: cameraId },
              config,
              (decodedText, decodedResult) => {
                onScan(decodedText);
                handleClose();
              },
              (errorMessage) => {
                if (!errorMessage.includes('NotFound') && !errorMessage.includes('NotAllowed')) {
                  console.log(`Scan error: ${errorMessage}`);
                }
              }
            );

            scannerRef.current = html5QrCode;
            setIsSwitchingCamera(false);
            
            setTimeout(async () => {
              await getMediaTrack();
            }, 500);
          }
        } catch (error) {
          const errorMessage = error?.message || error?.toString() || 'Unknown camera error';
          setError(new Error(`${t('failedToSwitchCamera')}: ${errorMessage}`));
          setIsSwitchingCamera(false);
        }
      }, 300);
      
    } catch (error) {
      const errorMessage = error?.message || error?.toString() || 'Unknown toggle error';
      setError(new Error(`${t('cameraSwitchFailed')}: ${errorMessage}`));
      setIsSwitchingCamera(false);
    }
  };

  const onPickFromGallery = () => fileInputRef.current?.click();

  const handleFileSelected = async (event) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      const html5QrCode = new (await import('html5-qrcode')).Html5Qrcode("file-reader");
      
      const result = await html5QrCode.scanFile(file, true);
      if (result) {
        onScan(result);
        handleClose();
      }
    } catch (e) {
      setError(new Error(t('unableToReadCodeFromImage')));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="qr-scanner-overlay">
      <div className="qr-scanner-modal">
        <div className="qr-top">
          <button className="back-btn" onClick={handleClose} aria-label={t('close')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="topbar">
            <button className="topbar-btn" onClick={onPickFromGallery} aria-label={t('gallery')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M4 5H20V19H4V5Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M4 16L9 11L12 14L15 11L20 16" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
            <button className={`topbar-btn ${torchOn ? 'active' : ''}`} onClick={() => applyTorch(!torchOn)} aria-label={t('flash')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M7 2H17L10 13H14L7 22V13H3L7 2Z" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </button>
            <button className="topbar-btn" onClick={toggleFacingMode} aria-label={t('switchCamera')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 7h-3l-2-2H9L7 7H4a2 2 0 00-2 2v7a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 15l-2-2 2-2M16 9l2 2-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div className="qr-scanner-content" ref={containerRef}>
          {error ? (
            <div className="qr-scanner-error">
              <p>{t('errorAccessingCamera')}: {error.message}</p>
              <button onClick={() => {
                setError(null);
                cleanupScanner();
                // Force re-initialization
                setTimeout(() => {
                  if (isOpen) {
                    setIsScanning(true);
                  }
                }, 100);
              }}>{t('tryAgain')}</button>
            </div>
          ) : (
            <div className="qr-scanner-viewport">
              <div id="qr-reader"></div>
              <div id="file-reader" style={{ display: 'none' }}></div>
              {isSwitchingCamera && (
                <div className="qr-scanner-loading" style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.8)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 20
                }}>
                  <div className="loading-spinner"></div>
                  <p style={{ color: 'white', marginTop: '10px' }}>{t('switchingCamera')}</p>
                </div>
              )}
              
              <div className="qr-scanner-overlay-frame">
                <div className="qr-scanner-corner top-left" />
                <div className="qr-scanner-corner top-right" />
                <div className="qr-scanner-corner bottom-left" />
                <div className="qr-scanner-corner bottom-right" />
                <div className="scan-line" />
              </div>
            </div>
          )}
        </div>
        
        <div className="qr-scanner-bottom-ui">
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={() => applyZoom(Math.max(1, zoom - 0.2))}>-</button>
            <input 
              className="zoom-slider"
              type="range"
              min="1" max="5" step="0.1"
              value={zoom}
              onChange={(e) => applyZoom(parseFloat(e.target.value))}
            />
            <button className="zoom-btn" onClick={() => applyZoom(Math.min(5, zoom + 0.2))}>+</button>
          </div>
          <button className="capture-btn" aria-label={t('capture')}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 8a4 4 0 100 8 4 4 0 000-8Z" stroke="white" strokeWidth="2"/>
              <path d="M9 7l1-2h4l1 2h2a2 2 0 012 2v7a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2h2Z" stroke="white" strokeWidth="2"/>
            </svg>
          </button>
        </div>

        <input 
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelected}
        />
      </div>
    </div>,
    document.body
  );
};

export default QRScanner;
