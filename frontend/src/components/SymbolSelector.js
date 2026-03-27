import React, { useState } from 'react';
import styled from 'styled-components';

const SelectorContainer = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 15px;
  padding: 1.5rem;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  height: fit-content;
`;

const SelectorTitle = styled.h2`
  margin: 0 0 1.5rem 0;
  font-size: 1.3rem;
  text-align: center;
  color: #ffd89b;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.3);
  color: #ffffff;
  font-size: 0.9rem;
  margin-bottom: 1rem;
  box-sizing: border-box;
  
  &::placeholder {
    color: #b8b8b8;
  }
  
  &:focus {
    outline: none;
    border-color: #ffd89b;
    box-shadow: 0 0 10px rgba(255, 216, 155, 0.3);
  }
`;

const SymbolList = styled.div`
  max-height: 400px;
  overflow-y: auto;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
`;

const SymbolItem = styled.div`
  padding: 0.8rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
  background: ${props => props.selected ? 'rgba(255, 216, 155, 0.2)' : 'transparent'};
  
  &:hover {
    background: rgba(255, 216, 155, 0.1);
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const SymbolName = styled.div`
  font-weight: bold;
  color: ${props => props.selected ? '#ffd89b' : '#ffffff'};
  font-size: 0.9rem;
`;

const SymbolInfo = styled.div`
  font-size: 0.7rem;
  color: #b8b8b8;
  margin-top: 0.2rem;
`;

const QuickFilters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const FilterButton = styled.button`
  background: ${props => props.active ? 
    'linear-gradient(135deg, #ffd89b, #19547b)' : 
    'rgba(255, 255, 255, 0.1)'};
  border: 1px solid ${props => props.active ? '#ffd89b' : 'rgba(255, 255, 255, 0.3)'};
  color: ${props => props.active ? '#000' : '#fff'};
  padding: 0.4rem 0.8rem;
  border-radius: 15px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: ${props => props.active ? 
      'linear-gradient(135deg, #ffd89b, #19547b)' : 
      'rgba(255, 255, 255, 0.2)'};
  }
`;

const StatsSection = styled.div`
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
`;

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.8rem;
  
  &:last-child {
    margin-bottom: 0;
  }
`;

// Popular Indian stock categories
const stockCategories = {
  'Banking': ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK'],
  'IT': ['TCS', 'INFY', 'WIPRO'],
  'FMCG': ['HINDUNILVR', 'ITC', 'NESTLEIND'],
  'Auto': ['MARUTI'],
  'Finance': ['BAJFINANCE'],
  'Telecom': ['BHARTIARTL'],
  'Paints': ['ASIANPAINT'],
  'Cement': ['ULTRACEMCO'],
  'Power': ['POWERGRID'],
  'Jewelry': ['TITAN']
};

function SymbolSelector({ symbols = [], selectedSymbol, onSymbolSelect }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  // Ensure symbols is always an array
  const symbolsArray = Array.isArray(symbols) ? symbols : [];

  // Filter symbols based on search term and category
  const filteredSymbols = symbolsArray.filter(symbol => {
    const matchesSearch = symbol.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeFilter === 'All') return matchesSearch;
    
    const categorySymbols = stockCategories[activeFilter] || [];
    return matchesSearch && categorySymbols.includes(symbol);
  });

  const handleFilterClick = (filter) => {
    setActiveFilter(filter);
    setSearchTerm('');
  };

  // Get category for a symbol
  const getSymbolCategory = (symbol) => {
    for (const [category, categorySymbols] of Object.entries(stockCategories)) {
      if (categorySymbols.includes(symbol)) {
        return category;
      }
    }
    return 'Other';
  };

  return (
    <SelectorContainer>
      <SelectorTitle>🎯 Symbol Scanner</SelectorTitle>
      
      <SearchInput
        type="text"
        placeholder="Search stocks..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      
      <QuickFilters>
        <FilterButton 
          active={activeFilter === 'All'} 
          onClick={() => handleFilterClick('All')}
        >
          All
        </FilterButton>
        {Object.keys(stockCategories).map(category => (
          <FilterButton
            key={category}
            active={activeFilter === category}
            onClick={() => handleFilterClick(category)}
          >
            {category}
          </FilterButton>
        ))}
      </QuickFilters>
      
      <SymbolList>
        {filteredSymbols.length > 0 ? (
          filteredSymbols.map(symbol => (
            <SymbolItem
              key={symbol}
              selected={symbol === selectedSymbol}
              onClick={() => onSymbolSelect(symbol)}
            >
              <SymbolName selected={symbol === selectedSymbol}>
                {symbol}
              </SymbolName>
              <SymbolInfo>
                {getSymbolCategory(symbol)} • NSE
              </SymbolInfo>
            </SymbolItem>
          ))
        ) : (
          <div style={{
            padding: '2rem', 
            textAlign: 'center', 
            color: '#b8b8b8'
          }}>
            {searchTerm ? 'No symbols found' : 'No symbols available'}
          </div>
        )}
      </SymbolList>
      
      <StatsSection>
        <h4 style={{
          margin: '0 0 0.8rem 0', 
          fontSize: '0.9rem', 
          color: '#ffd89b',
          textAlign: 'center'
        }}>
          Scanner Stats
        </h4>
        <StatRow>
          <span>Total Symbols:</span>
          <span>{symbols.length}</span>
        </StatRow>
        <StatRow>
          <span>Filtered:</span>
          <span>{filteredSymbols.length}</span>
        </StatRow>
        <StatRow>
          <span>Selected:</span>
          <span>{selectedSymbol || 'None'}</span>
        </StatRow>
        <StatRow>
          <span>Category:</span>
          <span>{selectedSymbol ? getSymbolCategory(selectedSymbol) : '-'}</span>
        </StatRow>
      </StatsSection>
    </SelectorContainer>
  );
}

export default SymbolSelector;