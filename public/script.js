// Configuration - Load from environment or use defaults
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = ''
// Load environment variables from .env file
async function loadEnvVariables() {
    try {
        const response = await fetch('.env');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const envText = await response.text();
        
        const envLines = envText.split('\n');
        envLines.forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const [key, value] = trimmedLine.split('=');
                if (key && value) {
                    if (key.trim() === 'SUPABASE_URL') {
                        SUPABASE_URL = value.trim();
                        console.log('✅ Loaded SUPABASE_URL from .env');
                    } else if (key.trim() === 'SUPABASE_ANON_KEY') {
                        SUPABASE_ANON_KEY = value.trim();
                        console.log('✅ Loaded SUPABASE_ANON_KEY from .env');
                    }
                }
            }
        });
        console.log('Environment variables loaded successfully');
    } catch (error) {
        console.log('Could not load .env file, using fallback values:', error.message);
        // Fallback to hardcoded values
        SUPABASE_URL = 'https://sxdjyhkwusnsuxgqtakd.supabase.co';
        SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4ZGp5aGt3dXNuc3V4Z3F0YWtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxOTQyMTEsImV4cCI6MjA3Mzc3MDIxMX0.IHWPeS7F8VghNyQrgzy7BaDgOiQRP7bLwCVTNa_XEnc';
        console.log('Using fallback Supabase credentials');
    }
}
// Global variables
let currentSlide = 0;
const totalSlides = 3;
let slider;
let dots;
let audio;
let audioPlaying = false;
let autoSlideInterval;
let isTransitioning = false;

// ======================
// Mobile Detection & Fixes
// ======================

// Detect if device is mobile
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Fix viewport height on mobile
function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    // Update slider container height
    if (slider) {
        slider.style.height = `${window.innerHeight}px`;
    }
}

// Prevent pull-to-refresh on mobile
function preventPullToRefresh() {
    let lastY = 0;

    document.addEventListener('touchstart', (e) => {
        lastY = e.touches[0].clientY;
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        const y = e.touches[0].clientY;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop === 0 && y > lastY) {
            e.preventDefault();
        }
        lastY = y;
    }, { passive: false });
}

// ======================
// Tracking Functions
// ======================

// Detect device type
function getDeviceType() {
    const ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) {
        return 'tablet';
    }
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
        return 'mobile';
    }
    return 'desktop';
}

// Get device memory info
function getDeviceMemory() {
    if ('deviceMemory' in navigator) {
        return navigator.deviceMemory + ' GB';
    }
    return 'unknown';
}

// Get hardware concurrency (CPU cores)
function getHardwareConcurrency() {
    if ('hardwareConcurrency' in navigator) {
        return navigator.hardwareConcurrency;
    }
    return 'unknown';
}

// Get battery information
async function getBatteryInfo() {
    if ('getBattery' in navigator) {
        try {
            const battery = await navigator.getBattery();
            return {
                level: Math.round(battery.level * 100) + '%',
                charging: battery.charging,
                chargingTime: battery.chargingTime === Infinity ? 'unknown' : battery.chargingTime + 's',
                dischargingTime: battery.dischargingTime === Infinity ? 'unknown' : battery.dischargingTime + 's'
            };
        } catch (error) {
            console.log('Battery API error:', error);
            return null;
        }
    }
    return null;
}

// Get touch support information
function getTouchSupport() {
    return {
        maxTouchPoints: navigator.maxTouchPoints || 0,
        touchSupported: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    };
}

// Get WebGL information
function getWebGLInfo() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return {
                vendor: gl.getParameter(debugInfo ? debugInfo.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
                renderer: gl.getParameter(debugInfo ? debugInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
            };
        }
    } catch (error) {
        console.log('WebGL error:', error);
    }
    return null;
}

// Collect all visitor information
async function collectVisitorInfo() {
    const data = {
        timestamp: new Date().toISOString(),
        device_type: getDeviceType(),
        user_agent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        screen_resolution: `${screen.width}x${screen.height}`,
        window_size: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        referrer: document.referrer,
        url: window.location.href
    };

    // Add simple IP if possible
    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        data.ip = ipData.ip;
    } catch (error) {
        console.log('Could not get IP:', error.message);
        data.ip = 'unknown';
    }

    console.log('Collected visitor data:', data);
    return data;
}

// Send data to Supabase
async function sendToSupabase(data) {
    // Skip if credentials not configured
    if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL' || !SUPABASE_ANON_KEY) {
        console.log('Supabase not configured. Skipping data save.');
        console.log('SUPABASE_URL:', SUPABASE_URL);
        console.log('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'Set' : 'Not set');
        return;
    }

    try {
        console.log('Sending data to Supabase:', data);
        const response = await fetch(`${SUPABASE_URL}/rest/v1/visitors`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(data)
        });

        console.log('Supabase response status:', response.status);
        console.log('Supabase response headers:', [...response.headers.entries()]);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Supabase error response:', errorText);
            throw new Error(`Failed to save visitor data: ${response.status} ${errorText}`);
        }
        console.log('✅ Visitor data saved successfully to Supabase');
    } catch (error) {
        console.error('❌ Supabase error:', error);
        console.error('Error details:', error.message);
    }
}

// Initialize tracking
async function initTracking() {
    try {
        const visitorData = await collectVisitorInfo();
        await sendToSupabase(visitorData);
    } catch (error) {
        console.error('Tracking error:', error);
    }
}

// ======================
// Slider Functions
// ======================

// Update slider position
function updateSlider() {
    if (isTransitioning) return;

    isTransitioning = true;
    slider.style.transform = `translateX(-${currentSlide * 100}%)`;

    // Update navigation dots
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentSlide);
    });

    // Reset transition flag after animation
    setTimeout(() => {
        isTransitioning = false;
    }, 500);
}

// Go to specific slide
function goToSlide(slideIndex) {
    if (slideIndex >= 0 && slideIndex < totalSlides) {
        currentSlide = slideIndex;
        updateSlider();

        // Reset auto-slide timer
        if (autoSlideInterval) {
            clearInterval(autoSlideInterval);
            startAutoSlide();
        }
    }
}

// Auto-slide functionality
function autoSlide() {
    currentSlide = (currentSlide + 1) % totalSlides;
    updateSlider();
}

// Start auto-slide
function startAutoSlide() {
    autoSlideInterval = setInterval(autoSlide, 7000);
}

// ======================
// Button Handlers
// ======================

// Handle Yes button
function handleYes() {
    showCelebration('💕');
    setTimeout(() => {
        alert('Yay! 🎉 I knew you\'d say yes! Can\'t wait for Saturday! 💕');
    }, 500);
}

// Handle No button (trick!)
function handleNo() {
    // Change the No button to Yes
    event.target.textContent = 'YES! 😍';
    event.target.className = 'choice-btn yes-btn';

    showCelebration('😊');

    setTimeout(() => {
        alert('Nice try! 😄 But deep down we both know it\'s a YES! See you Saturday! 💕');
    }, 500);
}

// Show celebration emoji
function showCelebration(emoji) {
    const celebration = document.getElementById('celebration');
    celebration.textContent = emoji;
    celebration.style.display = 'block';

    setTimeout(() => {
        celebration.style.display = 'none';
    }, 1000);
}

// ======================
// Audio Functions
// ======================

// Toggle audio
function toggleAudio() {
    const audioIcon = document.getElementById('audioIcon');

    if (audioPlaying) {
        audio.pause();
        audioIcon.textContent = '🔇';
        audioPlaying = false;
    } else {
        // Unmute and play
        audio.muted = false;
        audio.play().then(() => {
            audioIcon.textContent = '🎵';
            audioPlaying = true;
        }).catch(e => {
            console.log('Audio play failed:', e);
            // Try again with user gesture
            audio.muted = false;
            audio.play().catch(err => console.log('Retry failed:', err));
        });
    }
}

// ======================
// Privacy Functions
// ======================

// Accept privacy notice (if you add the privacy notice)
function acceptPrivacy() {
    const privacyNotice = document.getElementById('privacyNotice');
    if (privacyNotice) {
        privacyNotice.style.display = 'none';
        localStorage.setItem('privacyAccepted', 'true');
    }
}

// ======================
// Touch/Swipe Handlers
// ======================

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

function handleSwipe() {
    const swipeThreshold = 50;
    const verticalThreshold = 100;

    const diffX = touchEndX - touchStartX;
    const diffY = Math.abs(touchEndY - touchStartY);

    // Only handle horizontal swipes (ignore vertical)
    if (diffY < verticalThreshold) {
        if (diffX < -swipeThreshold && currentSlide < totalSlides - 1) {
            goToSlide(currentSlide + 1);
        } else if (diffX > swipeThreshold && currentSlide > 0) {
            goToSlide(currentSlide - 1);
        }
    }
}

// ======================
// Event Listeners
// ======================

// DOMContentLoaded event
document.addEventListener('DOMContentLoaded', async () => {
    // Load environment variables first
    await loadEnvVariables();
    
    // Initialize DOM elements
    slider = document.getElementById('slider');
    dots = document.querySelectorAll('.dot');
    audio = document.getElementById('backgroundMusic');

    // Mobile optimizations
    if (isMobile()) {
        setViewportHeight();
        preventPullToRefresh();

        // Update on orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(setViewportHeight, 100);
        });
    }

    // Set audio properties
    audio.volume = 0.3;

    // Initialize tracking
    await initTracking();

    // Check if privacy was already accepted
    const privacyAccepted = localStorage.getItem('privacyAccepted');
    const privacyNotice = document.getElementById('privacyNotice');
    if (privacyNotice && privacyAccepted) {
        privacyNotice.style.display = 'none';
    }

    // Auto-start audio on first user interaction
    let audioStarted = false;
    const startAudio = () => {
        if (audioStarted) return;

        audio.muted = false;
        audio.play().then(() => {
            audioPlaying = true;
            audioStarted = true;
            document.getElementById('audioIcon').textContent = '🎵';
            console.log('Audio started successfully');
        }).catch(e => {
            console.log('Audio play failed:', e);
        });

        // Remove listeners after first interaction
        document.removeEventListener('click', startAudio);
        document.removeEventListener('touchstart', startAudio);
        document.removeEventListener('keydown', startAudio);
    };

    // Listen for any user interaction
    document.addEventListener('click', startAudio);
    document.addEventListener('touchstart', startAudio, { passive: true });
    document.addEventListener('keydown', startAudio);

    // Start auto-sliding after 5 seconds
    setTimeout(() => {
        startAutoSlide();
    }, 5000);
});

// Window load event
window.addEventListener('load', () => {
    // Additional setup after full page load
    setViewportHeight();

    // Log page performance
    if (window.performance) {
        const perfData = window.performance.getEntriesByType('navigation')[0];
        if (perfData) {
            console.log('Page Performance:', {
                loadTime: perfData.loadEventEnd - perfData.loadEventStart,
                domContentLoaded: perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart,
                responseTime: perfData.responseEnd - perfData.responseStart
            });
        }
    }
});

// Handle keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && currentSlide > 0) {
        goToSlide(currentSlide - 1);
    } else if (e.key === 'ArrowRight' && currentSlide < totalSlides - 1) {
        goToSlide(currentSlide + 1);
    }
});

// Handle touch events for mobile swipe
document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
}, { passive: true });

// Prevent double-tap zoom on mobile
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

// Handle window resize
window.addEventListener('resize', () => {
    setViewportHeight();
});

// Visibility change handler (pause audio when tab is hidden)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (audioPlaying && audio) {
            audio.pause();
        }
        if (autoSlideInterval) {
            clearInterval(autoSlideInterval);
        }
    } else {
        if (audioPlaying && audio) {
            audio.play().catch(e => console.log('Resume play failed:', e));
        }
        startAutoSlide();
    }
});

// Prevent context menu on mobile (optional)
if (isMobile()) {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
}