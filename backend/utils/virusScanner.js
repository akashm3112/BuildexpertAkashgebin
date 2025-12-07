/**
 * ============================================================================
 * VIRUS SCANNING UTILITY
 * Purpose: Scan uploaded files for malware and viruses
 * ============================================================================
 */

const logger = require('./logger');
const config = require('./config');
const { ValidationError } = require('./errorTypes');

// Virus scanning service configuration
const VIRUS_SCAN_ENABLED = process.env.VIRUS_SCAN_ENABLED !== 'false'; // Enabled by default
const VIRUS_TOTAL_API_KEY = process.env.VIRUS_TOTAL_API_KEY;
const VIRUS_SCAN_TIMEOUT = parseInt(process.env.VIRUS_SCAN_TIMEOUT) || 10000; // 10 seconds

// Suspicious file patterns (heuristic detection)
const SUSPICIOUS_PATTERNS = [
  // Executable patterns
  /MZ[\x90\x00]/, // PE executable (Windows)
  /\x7fELF/, // ELF executable (Linux)
  /\xca\xfe\xba\xbe/, // Mach-O executable (macOS)
  /PK\x03\x04.*\.(exe|dll|bat|cmd|scr|com|pif|vbs|js|jar|app)/i, // ZIP with executable
  
  // Script injection patterns
  /<script[^>]*>/i,
  /javascript:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
  
  // PHP/Server-side code
  /<\?php/i,
  /<%/i,
  /<%=\s*Response/i,
  
  // Suspicious headers
  /Content-Type:\s*application\/(x-msdownload|octet-stream|java-archive)/i,
  
  // Known malware signatures (simplified - real scanning should use VirusTotal)
  /\x4d\x5a.*This program cannot be run/i, // Windows executable warning
];

// Known safe image patterns (to reduce false positives)
const SAFE_IMAGE_PATTERNS = [
  /\xFF\xD8\xFF/, // JPEG
  /\x89\x50\x4E\x47\x0D\x0A\x1A\x0A/, // PNG
  /GIF8[79]a/, // GIF
  /RIFF.*WEBP/, // WebP
];

/**
 * Heuristic virus scanning using pattern matching
 * This is a basic check - for production, use VirusTotal API or ClamAV
 */
function heuristicScan(buffer) {
  if (!buffer || buffer.length === 0) {
    return { clean: false, reason: 'Empty file' };
  }

  // Check if it's a known safe image format
  const isSafeImage = SAFE_IMAGE_PATTERNS.some(pattern => pattern.test(buffer));
  
  // For images, do lighter scanning (check for embedded scripts and polyglots)
  if (isSafeImage) {
    // Check for script injection in images (polyglot files)
    const scriptPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /onerror\s*=/i,
      /onload\s*=/i,
      /onclick\s*=/i,
      /vbscript:/i,
      /data:text\/html/i,
    ];
    
    // Check first 2KB for embedded scripts (polyglot detection)
    const bufferString = buffer.toString('latin1', 0, Math.min(2048, buffer.length));
    for (const pattern of scriptPatterns) {
      if (pattern.test(bufferString)) {
        logger.warn('Suspicious content detected in image (possible polyglot file)', {
          pattern: pattern.toString(),
          size: buffer.length
        });
        return { clean: false, reason: 'Suspicious content detected in image (possible polyglot file)', pattern: pattern.toString() };
      }
    }
    
    return { clean: true };
  }

  // For non-images, do full pattern scanning
  const bufferString = buffer.toString('latin1', 0, Math.min(2048, buffer.length));
  
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(bufferString)) {
      return { clean: false, reason: 'Suspicious pattern detected', pattern: pattern.toString() };
    }
  }

  return { clean: true };
}

/**
 * Scan file using VirusTotal API (if configured)
 * Falls back to heuristic scanning if API key not available
 */
async function scanWithVirusTotal(buffer, filename) {
  if (!VIRUS_TOTAL_API_KEY) {
    // No API key - use heuristic scanning
    return heuristicScan(buffer);
  }

  try {
    // Use node-fetch and form-data for Node.js
    const fetch = require('node-fetch');
    let FormData;
    
    try {
      FormData = require('form-data');
    } catch (e) {
      // form-data not installed - use heuristic scanning
      logger.warn('form-data package not available, using heuristic scanning');
      return heuristicScan(buffer);
    }
    
    const form = new FormData();
    form.append('file', buffer, {
      filename: filename || 'file',
      contentType: 'application/octet-stream'
    });

    // Create AbortController (Node.js 15+ has it, otherwise use polyfill)
    let AbortControllerClass;
    try {
      AbortControllerClass = global.AbortController || require('abort-controller').AbortController;
    } catch (e) {
      // Fallback: use simple timeout without AbortController
      AbortControllerClass = class {
        constructor() {
          this.signal = { aborted: false };
        }
        abort() {
          this.signal.aborted = true;
        }
      };
    }
    
    const controller = new AbortControllerClass();
    const timeoutId = setTimeout(() => controller.abort(), VIRUS_SCAN_TIMEOUT);

    try {
      const response = await fetch('https://www.virustotal.com/api/v3/files', {
        method: 'POST',
        headers: {
          'x-apikey': VIRUS_TOTAL_API_KEY,
          ...form.getHeaders()
        },
        body: form,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // If API fails, fall back to heuristic scanning
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.warn('VirusTotal API request failed, using heuristic scanning', {
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 200)
        });
        return heuristicScan(buffer);
      }

      const data = await response.json();
      const analysisId = data.data?.id;

      if (!analysisId) {
        logger.warn('VirusTotal API did not return analysis ID, using heuristic scanning');
        return heuristicScan(buffer);
      }

      // Wait a moment for analysis to complete, then check results
      await new Promise(resolve => setTimeout(resolve, 2000));

      const analysisController = new AbortControllerClass();
      const analysisTimeoutId = setTimeout(() => analysisController.abort(), VIRUS_SCAN_TIMEOUT);

      try {
        const analysisResponse = await fetch(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
          headers: {
            'x-apikey': VIRUS_TOTAL_API_KEY
          },
          signal: analysisController.signal
        });

        clearTimeout(analysisTimeoutId);

        if (!analysisResponse.ok) {
          logger.warn('VirusTotal analysis check failed, using heuristic scanning');
          return heuristicScan(buffer);
        }

        const analysisData = await analysisResponse.json();
        const stats = analysisData.data?.attributes?.stats;

        if (!stats) {
          logger.warn('VirusTotal analysis data incomplete, using heuristic scanning');
          return heuristicScan(buffer);
        }

        // If any engine detected malware, file is not clean
        if (stats.malicious > 0 || stats.suspicious > 0) {
          logger.warn('File flagged by VirusTotal', {
            filename,
            malicious: stats.malicious,
            suspicious: stats.suspicious
          });
          
          return {
            clean: false,
            reason: `File flagged by ${stats.malicious + stats.suspicious} security engines`,
            malicious: stats.malicious,
            suspicious: stats.suspicious,
            source: 'virustotal'
          };
        }

        return { clean: true, source: 'virustotal', stats };

      } catch (analysisError) {
        clearTimeout(analysisTimeoutId);
        
        if (analysisError.name === 'AbortError') {
          logger.warn('VirusTotal analysis check timeout, using heuristic scanning');
        } else {
          logger.warn('VirusTotal analysis check error, using heuristic scanning', { 
            error: analysisError.message 
          });
        }
        
        return heuristicScan(buffer);
      }

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
        logger.warn('VirusTotal API timeout, using heuristic scanning');
      } else {
        logger.warn('VirusTotal API error, using heuristic scanning', { error: error.message });
      }
      
      // Fall back to heuristic scanning
      return heuristicScan(buffer);
    }

  } catch (error) {
    logger.error('Virus scanning error', { error: error.message });
    // Fall back to heuristic scanning
    return heuristicScan(buffer);
  }
}

/**
 * Main virus scanning function
 * Uses VirusTotal if available, otherwise uses heuristic scanning
 */
async function scanFile(buffer, filename = 'file', options = {}) {
  const { useVirusTotal = true, timeout = VIRUS_SCAN_TIMEOUT } = options;

  if (!VIRUS_SCAN_ENABLED) {
    logger.info('Virus scanning disabled, skipping scan');
    return { clean: true, skipped: true };
  }

  if (!buffer || buffer.length === 0) {
    return { clean: false, reason: 'Empty file' };
  }

  // For small files (< 1KB), skip VirusTotal (likely images)
  if (buffer.length < 1024) {
    return heuristicScan(buffer);
  }

  // Try VirusTotal if enabled and API key available
  if (useVirusTotal && VIRUS_TOTAL_API_KEY) {
    try {
      return await scanWithVirusTotal(buffer, filename);
    } catch (error) {
      logger.warn('VirusTotal scan failed, falling back to heuristic', { error: error.message });
      return heuristicScan(buffer);
    }
  }

  // Use heuristic scanning
  return heuristicScan(buffer);
}

/**
 * Scan multiple files
 */
async function scanFiles(files, options = {}) {
  const results = await Promise.all(
    files.map(async (file) => {
      const buffer = file.buffer || file;
      const filename = file.originalname || file.filename || 'file';
      const scanResult = await scanFile(buffer, filename, options);
      
      return {
        filename,
        ...scanResult
      };
    })
  );

  const cleanFiles = results.filter(r => r.clean);
  const infectedFiles = results.filter(r => !r.clean);

  return {
    allClean: infectedFiles.length === 0,
    cleanFiles,
    infectedFiles,
    total: results.length,
    clean: cleanFiles.length,
    infected: infectedFiles.length
  };
}

module.exports = {
  scanFile,
  scanFiles,
  heuristicScan,
  VIRUS_SCAN_ENABLED,
  SUSPICIOUS_PATTERNS
};

