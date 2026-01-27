// HelpDropdown.jsx
// Help dropdown menu component for ProjectCoach AI Forge Edition

import React, { useState, useRef, useEffect } from 'react';
import './HelpDropdown.css';

const HelpDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleMenuItemClick = (action) => {
    setIsOpen(false);
    
    // Handle different actions
    switch (action) {
      case 'faq':
        window.location.href = '/faq';
        break;
      case 'tutorials':
        window.location.href = '/tutorials';
        break;
      case 'shortcuts':
        // Trigger keyboard shortcuts modal
        // You can dispatch a custom event or call a function
        window.dispatchEvent(new CustomEvent('show-shortcuts-modal'));
        break;
      case 'contact':
        window.location.href = 'mailto:support@projectcoachai.com';
        break;
      case 'report':
        // Trigger report issue modal
        window.dispatchEvent(new CustomEvent('show-report-modal'));
        break;
      case 'feature':
        window.location.href = '/feedback';
        break;
      case 'roadmap':
        window.location.href = '/roadmap';
        break;
      case 'whats-new':
        // Trigger what's new modal
        window.dispatchEvent(new CustomEvent('show-whats-new-modal'));
        break;
      case 'community':
        window.open('https://discord.gg/projectcoach', '_blank');
        break;
      default:
        break;
    }
  };

  return (
    <div className="help-dropdown-container" ref={dropdownRef}>
      {/* Help Button */}
      <button
        className={`help-button ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Help menu"
        aria-expanded={isOpen}
      >
        <span className="help-icon">🆘</span>
        <span className="help-text">Help</span>
        <span className={`help-arrow ${isOpen ? 'open' : ''}`}>▼</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="help-dropdown-menu">
          {/* Header */}
          <div className="help-menu-header">
            <h3>Help & Resources</h3>
            <p>Get the most out of Forge</p>
          </div>

          {/* Learn Section */}
          <div className="help-menu-section">
            <div className="section-label">Learn</div>
            
            <button
              className="help-menu-item highlight"
              onClick={() => handleMenuItemClick('faq')}
            >
              <span className="menu-icon">📚</span>
              <div className="menu-content">
                <span className="menu-title">FAQ & Help Center</span>
                <span className="menu-description">Find answers to common questions</span>
              </div>
              <span className="item-arrow">→</span>
            </button>

            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('tutorials')}
            >
              <span className="menu-icon">🎥</span>
              <div className="menu-content">
                <span className="menu-title">Video Tutorials</span>
                <span className="menu-description">Watch how-to guides</span>
              </div>
              <span className="item-arrow">→</span>
            </button>

            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('shortcuts')}
            >
              <span className="menu-icon">⌨️</span>
              <div className="menu-content">
                <span className="menu-title">Keyboard Shortcuts</span>
                <span className="menu-description">Work faster with shortcuts</span>
              </div>
              <span className="item-arrow">→</span>
            </button>
          </div>

          {/* Support Section */}
          <div className="help-menu-section">
            <div class="section-label">Support</div>
            
            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('contact')}
            >
              <span className="menu-icon">💬</span>
              <div className="menu-content">
                <span className="menu-title">Contact Support</span>
                <span className="menu-description">Get help from our team</span>
              </div>
              <span className="item-arrow">→</span>
            </button>

            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('report')}
            >
              <span className="menu-icon">🐛</span>
              <div className="menu-content">
                <span className="menu-title">Report Issue</span>
                <span className="menu-description">Found a bug? Let us know</span>
              </div>
              <span className="item-arrow">→</span>
            </button>

            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('feature')}
            >
              <span className="menu-icon">💡</span>
              <div className="menu-content">
                <span className="menu-title">Request Feature</span>
                <span className="menu-description">Suggest improvements</span>
              </div>
              <span className="item-arrow">→</span>
            </button>
          </div>

          {/* Discover Section */}
          <div className="help-menu-section">
            <div className="section-label">Discover</div>
            
            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('roadmap')}
            >
              <span className="menu-icon">🗺️</span>
              <div className="menu-content">
                <span className="menu-title">Roadmap</span>
                <span className="menu-description">See what's coming next</span>
              </div>
              <span className="item-arrow">→</span>
            </button>

            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('whats-new')}
            >
              <span className="menu-icon">📢</span>
              <div className="menu-content">
                <span className="menu-title">What's New</span>
                <span className="menu-description">Latest features & updates</span>
              </div>
              <span className="item-arrow">→</span>
            </button>

            <button
              className="help-menu-item"
              onClick={() => handleMenuItemClick('community')}
            >
              <span className="menu-icon">👥</span>
              <div className="menu-content">
                <span className="menu-title">Community</span>
                <span className="menu-description">Join our Discord</span>
              </div>
              <span className="item-arrow">→</span>
            </button>
          </div>

          {/* Footer */}
          <div className="help-menu-footer">
            <div className="footer-left">
              <span className="swiss-flag">🇨🇭</span>
              <span className="footer-text">Swiss privacy compliant</span>
            </div>
            <span className="version-info">v1.0 • Forge Edition</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpDropdown;
