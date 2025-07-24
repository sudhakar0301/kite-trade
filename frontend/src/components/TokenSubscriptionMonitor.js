import React, { useState, useEffect } from 'react';

const TokenSubscriptionMonitor = ({ socket }) => {
  const [subscriptionUpdates, setSubscriptionUpdates] = useState([]);
  const [currentStats, setCurrentStats] = useState({
    totalTokens: 0,
    tokensAdded: 0,
    tokensRemoved: 0,
    lastUpdate: null
  });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleTokenUpdate = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('Token update received:', msg);
        
        if (msg.type === 'token_subscription_update') {
          const update = {
            ...msg,
            timestamp: new Date().toLocaleTimeString(),
            id: Date.now()
          };
          
          // Update current stats
          setCurrentStats({
            totalTokens: msg.totalTokens || 0,
            tokensAdded: msg.tokensAdded?.length || 0,
            tokensRemoved: msg.tokensRemoved?.length || 0,
            lastUpdate: new Date().toLocaleTimeString()
          });
          
          // Add to updates history (keep last 10)
          setSubscriptionUpdates(prev => {
            const newUpdates = [update, ...prev].slice(0, 10);
            return newUpdates;
          });
        }
      } catch (err) {
        console.error('Error parsing token update:', err);
      }
    };

    socket.addEventListener('message', handleTokenUpdate);
    
    return () => {
      socket.removeEventListener('message', handleTokenUpdate);
    };
  }, [socket]);

  const getStatusColor = (tokensAdded, tokensRemoved) => {
    if (tokensAdded > 0 && tokensRemoved > 0) return '#ff9800'; // Orange for mixed changes
    if (tokensAdded > 0) return '#4caf50'; // Green for additions
    if (tokensRemoved > 0) return '#f44336'; // Red for removals
    return '#2196f3'; // Blue for no changes
  };

  const getStatusIcon = (tokensAdded, tokensRemoved) => {
    if (tokensAdded > 0 && tokensRemoved > 0) return '🔄';
    if (tokensAdded > 0) return '➕';
    if (tokensRemoved > 0) return '➖';
    return '📊';
  };

  return (
    <div>
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.02); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}
      </style>
      <div style={{
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        border: '1px solid #333',
        borderRadius: '8px',
        margin: '10px',
        padding: '15px',
        color: 'white',
        fontFamily: 'monospace'
      }}>
        {/* Header with current stats */}
        <div 
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            marginBottom: isExpanded ? '15px' : '0'
          }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
              📡 Token Subscription Monitor
            </span>
            <span style={{ 
              background: '#333', 
              padding: '2px 8px', 
              borderRadius: '12px', 
              fontSize: '12px' 
            }}>
              {currentStats.totalTokens} tokens
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {currentStats.lastUpdate && (
              <span style={{ fontSize: '12px', opacity: 0.8 }}>
                Last: {currentStats.lastUpdate}
              </span>
            )}
            <span style={{ fontSize: '16px' }}>
              {isExpanded ? '🔼' : '🔽'}
            </span>
          </div>
        </div>

        {/* Quick stats bar */}
        <div style={{
          display: 'flex',
          gap: '10px',
          marginBottom: isExpanded ? '15px' : '0'
        }}>
          <div style={{
            background: 'rgba(76, 175, 80, 0.2)',
            border: '1px solid #4caf50',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '12px',
            flex: 1,
            textAlign: 'center'
          }}>
            ➕ Added: {currentStats.tokensAdded}
          </div>
          <div style={{
            background: 'rgba(244, 67, 54, 0.2)',
            border: '1px solid #f44336',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '12px',
            flex: 1,
            textAlign: 'center'
          }}>
            ➖ Removed: {currentStats.tokensRemoved}
          </div>
          <div style={{
            background: 'rgba(33, 150, 243, 0.2)',
            border: '1px solid #2196f3',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '12px',
            flex: 1,
            textAlign: 'center'
          }}>
            📊 Total: {currentStats.totalTokens}
          </div>
        </div>

        {/* Expanded content with update history */}
        {isExpanded && (
          <div>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 'bold', 
              marginBottom: '10px',
              borderBottom: '1px solid #444',
              paddingBottom: '5px'
            }}>
              📋 Recent Updates ({subscriptionUpdates.length})
            </div>
            
            {subscriptionUpdates.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                opacity: 0.6, 
                padding: '20px',
                fontStyle: 'italic'
              }}>
                🕐 Waiting for token updates...
              </div>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {subscriptionUpdates.map((update, index) => (
                  <div key={update.id} style={{
                    background: index === 0 ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${getStatusColor(update.tokensAdded?.length || 0, update.tokensRemoved?.length || 0)}`,
                    borderRadius: '4px',
                    padding: '10px',
                    marginBottom: '8px',
                    animation: index === 0 ? 'pulse 1s ease-in-out' : 'none'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '5px'
                    }}>
                      <span style={{ fontWeight: 'bold' }}>
                        {getStatusIcon(update.tokensAdded?.length || 0, update.tokensRemoved?.length || 0)} 
                        {update.message || 'Token Update'}
                      </span>
                      <span style={{ fontSize: '11px', opacity: 0.7 }}>
                        {update.timestamp}
                      </span>
                    </div>
                    
                    {update.csvFile && (
                      <div style={{ fontSize: '11px', opacity: 0.8, marginBottom: '5px' }}>
                        📁 File: {update.csvFile}
                      </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '15px', fontSize: '11px' }}>
                      {update.tokensAdded && update.tokensAdded.length > 0 && (
                        <span style={{ color: '#4caf50' }}>
                          ➕ Added: {update.tokensAdded.length}
                          {update.tokensAdded.length <= 5 && (
                            <span style={{ opacity: 0.7 }}>
                              {' '}({update.tokensAdded.slice(0, 3).join(', ')}{update.tokensAdded.length > 3 ? '...' : ''})
                            </span>
                          )}
                        </span>
                      )}
                      
                      {update.tokensRemoved && update.tokensRemoved.length > 0 && (
                        <span style={{ color: '#f44336' }}>
                          ➖ Removed: {update.tokensRemoved.length}
                          {update.tokensRemoved.length <= 5 && (
                            <span style={{ opacity: 0.7 }}>
                              {' '}({update.tokensRemoved.slice(0, 3).join(', ')}{update.tokensRemoved.length > 3 ? '...' : ''})
                            </span>
                          )}
                        </span>
                      )}
                      
                      {update.totalTokens !== undefined && (
                        <span style={{ color: '#2196f3' }}>
                          📊 Total: {update.totalTokens}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TokenSubscriptionMonitor;