import React, { useState, useMemo } from 'react';
import styled from 'styled-components';

const FilterContainer = styled.div`
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
`;

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const FilterTitle = styled.h3`
  color: #79c0ff;
  margin: 0;
  font-size: 16px;
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
`;

const FilterSection = styled.div`
  background: rgba(30, 60, 114, 0.1);
  border: 1px solid rgba(139, 148, 158, 0.2);
  border-radius: 8px;
  padding: 12px;
`;

const SectionHeader = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #8b949e;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const CheckboxGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const CheckboxItem = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #e6edf3;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: background 0.2s;
  
  &:hover {
    background: rgba(139, 148, 158, 0.1);
  }
`;

const Checkbox = styled.input`
  accent-color: #79c0ff;
`;

const StatsBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(121, 192, 255, 0.1);
  border: 1px solid rgba(121, 192, 255, 0.2);
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 12px;
  color: #79c0ff;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  
  .label {
    font-size: 10px;
    opacity: 0.8;
  }
  
  .value {
    font-weight: 600;
    font-size: 14px;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const ActionButton = styled.button`
  background: ${props => props.variant === 'clear' 
    ? 'rgba(248, 81, 73, 0.1)' 
    : 'rgba(16, 185, 129, 0.1)'};
  border: 1px solid ${props => props.variant === 'clear' 
    ? 'rgba(248, 81, 73, 0.3)' 
    : 'rgba(16, 185, 129, 0.3)'};
  color: ${props => props.variant === 'clear' ? '#f85149' : '#10b981'};
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: ${props => props.variant === 'clear' 
      ? 'rgba(248, 81, 73, 0.2)' 
      : 'rgba(16, 185, 129, 0.2)'};
  }
`;

// Define the exact 12 filter conditions from backend with OR logic only where it exists
const FILTER_CONDITIONS = {
  buy: [
    { id: 'buy_ema5_ema3', label: 'EMA5 (5min) < EMA3 (15min)', section: 'EMA Cross' },
    { id: 'buy_open_ema3', label: 'Open < EMA3 (15min)', section: 'Price Position' },
    { id: 'buy_plus_di_25', label: '+DI > 25 (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'buy_plus_di_adx', label: '+DI > ADX (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'buy_adx_5', label: 'ADX > 25 (5min)', section: 'ADX Conditions' },
    { id: 'buy_macd_signal_5', label: 'MACD > Signal (5min)', section: 'MACD Conditions' },
    { id: 'buy_macd_positive_5', label: 'MACD > 0 (5min)', section: 'MACD Conditions' },
    { id: 'buy_macd_positive_1', label: 'MACD > 0 (1min)', section: 'MACD Conditions' },
    { id: 'buy_ema9_vwap_1', label: 'EMA9 > VWAP (1min)', section: 'EMA Position' }
    // Removed: EMA3 > EMA5 (1min) - now handled by crossover scans
  ],
  sell: [
    { id: 'sell_ema5_ema3', label: 'EMA5 (5min) > EMA3 (15min)', section: 'EMA Cross' },
    { id: 'sell_open_ema3', label: 'Open > EMA3 (15min)', section: 'Price Position' },
    { id: 'sell_minus_di_25', label: '-DI > 25 (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'sell_minus_di_adx', label: '-DI > ADX (15min OR 5min)', section: 'ADX Conditions' },
    { id: 'sell_adx_5', label: 'ADX > 25 (5min)', section: 'ADX Conditions' },
    { id: 'sell_macd_signal_5', label: 'MACD < Signal (5min)', section: 'MACD Conditions' },
    { id: 'sell_macd_negative_5', label: 'MACD < 0 (5min)', section: 'MACD Conditions' },
    { id: 'sell_macd_negative_1', label: 'MACD < 0 (1min)', section: 'MACD Conditions' },
    { id: 'sell_ema9_vwap_1', label: 'EMA9 < VWAP (1min)', section: 'EMA Position' }
    // Removed: EMA3 < EMA5 (1min) - now handled by crossbelow scans
  ]
};

const FilterPanel = ({ type = 'buy', allStocks = [], onFilteredResults }) => {
  const [activeFilters, setActiveFilters] = useState({});

  // Group filter conditions by section

  // Apply filters to stocks
  const filteredResults = useMemo(() => {
    if (!allStocks.length) return [];

    console.log(`🔍 Filtering ${type}:`, allStocks.length, 'stocks with active filters:', activeFilters);

    // DEBUG: Check EMA values in first few stocks
    if (allStocks.length > 0) {
      const sampleStocks = allStocks.slice(0, 2);
      console.log('🔍 EMA DEBUG - Frontend received stocks:');
      sampleStocks.forEach((stock, i) => {
        console.log(`   Stock ${i + 1} (${stock.symbol || stock.s}):`, {
          ema3_1: stock.ema3_1,
          ema5_1: stock.ema5_1,
          ema9_1: stock.ema9_1,
          ema3_1_type: typeof stock.ema3_1,
          ema5_1_type: typeof stock.ema5_1,
          ema9_1_type: typeof stock.ema9_1
        });
        if (stock.ema3_1 !== undefined && stock.ema5_1 !== undefined && stock.ema9_1 !== undefined) {
          console.log(`     1min EMA conditions:`, {
            'ema5_1 > ema9_1': `${stock.ema5_1} > ${stock.ema9_1} = ${stock.ema5_1 > stock.ema9_1}`
            // Removed: ema3_1 > ema5_1 - now handled by crossover scans
          });
        }
      });
    }

    const activeFilterKeys = Object.keys(activeFilters).filter(key => activeFilters[key]);
    console.log(`📊 Active ${type} filters:`, activeFilterKeys.length);

    if (activeFilterKeys.length === 0) {
      // No filters selected - show all stocks
      return allStocks;
    }

    const filteredStocks = allStocks.filter(stock => {
      if (type === 'buy') {
        // Match exact backend buy conditions - all 12 conditions must pass (AND logic between conditions)
        
        // Condition 1: EMA5 (5min) < EMA3 (15min) - standalone condition
        const condition1 = !activeFilters.buy_ema5_ema3 || (stock.ema5_5 < stock.ema3_15);
        
        // Condition 2: Open < EMA3 (15min) - standalone condition
        const condition2 = !activeFilters.buy_open_ema3 || (stock.open15 < stock.ema3_15);
        
        // Condition 3: +DI > 25 (15min OR 5min) - OR condition exists in backend
        const condition3 = !activeFilters.buy_plus_di_25 || 
          (stock.plusDI15 > 25) || (stock.plusDI5 > 25);
        
        // Condition 4: +DI > ADX (15min OR 5min) - OR condition exists in backend  
        const condition4 = !activeFilters.buy_plus_di_adx ||
          (stock.plusDI15 > stock.adx15) || (stock.plusDI5 > stock.adx5);
        
        // Condition 5: ADX > 25 (5min) - standalone condition
        const condition5 = !activeFilters.buy_adx_5 || (stock.adx5 > 25);
        
        // Condition 6: MACD > Signal (5min) - standalone condition
        const condition6 = !activeFilters.buy_macd_signal_5 || (stock.macd5 > stock.signal5);
        
        // Condition 7: MACD > 0 (5min) - standalone condition
        const condition7 = !activeFilters.buy_macd_positive_5 || (stock.macd5 > 0);
        
        // Condition 8: MACD > 0 (1min) - standalone condition
        const condition8 = !activeFilters.buy_macd_positive_1 || (stock.macd1 > 0);
        
        // Condition 9: EMA9 > VWAP (1min) - standalone condition
        const condition9 = !activeFilters.buy_ema9_vwap_1 || (stock.ema9_1 > stock.vwap1);
        
        return condition1 && condition2 && condition3 && condition4 && condition5 && 
               condition6 && condition7 && condition8 && condition9;
               // Removed condition10 (EMA3 > EMA5) - handled by crossover scans
               
      } else {
        // Match exact backend sell conditions - all 12 conditions must pass (AND logic between conditions)
        
        // Condition 1: EMA5 (5min) > EMA3 (15min) - standalone condition
        const condition1 = !activeFilters.sell_ema5_ema3 || (stock.ema5_5 > stock.ema3_15);
        
        // Condition 2: Open > EMA3 (15min) - standalone condition
        const condition2 = !activeFilters.sell_open_ema3 || (stock.open15 > stock.ema3_15);
        
        // Condition 3: -DI > 25 (15min OR 5min) - OR condition exists in backend
        const condition3 = !activeFilters.sell_minus_di_25 || 
          (stock.minusDI15 > 25) || (stock.minusDI5 > 25);
        
        // Condition 4: -DI > ADX (15min OR 5min) - OR condition exists in backend  
        const condition4 = !activeFilters.sell_minus_di_adx ||
          (stock.minusDI15 > stock.adx15) || (stock.minusDI5 > stock.adx5);
        
        // Condition 5: ADX > 25 (5min) - standalone condition
        const condition5 = !activeFilters.sell_adx_5 || (stock.adx5 > 25);
        
        // Condition 6: MACD < Signal (5min) - standalone condition
        const condition6 = !activeFilters.sell_macd_signal_5 || (stock.macd5 < stock.signal5);
        
        // Condition 7: MACD < 0 (5min) - standalone condition
        const condition7 = !activeFilters.sell_macd_negative_5 || (stock.macd5 < 0);
        
        // Condition 8: MACD < 0 (1min) - standalone condition
        const condition8 = !activeFilters.sell_macd_negative_1 || (stock.macd1 < 0);
        
        // Condition 9: EMA9 < VWAP (1min) - standalone condition
        const condition9 = !activeFilters.sell_ema9_vwap_1 || (stock.ema9_1 < stock.vwap1);
        
        return condition1 && condition2 && condition3 && condition4 && condition5 && 
               condition6 && condition7 && condition8 && condition9;
               // Removed condition10 (EMA3 < EMA5) - handled by crossbelow scans
      }
    });

    console.log(`📊 ${type} filtering results:`, filteredStocks.length);
    return filteredStocks;
  }, [allStocks, activeFilters, type]);

  // Notify parent component of filtered results
  React.useEffect(() => {
    if (onFilteredResults) {
      onFilteredResults(filteredResults);
    }
  }, [filteredResults, onFilteredResults]);

  const handleFilterChange = (filterId, checked) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterId]: checked
    }));
  };

  const clearAllFilters = () => {
    setActiveFilters({});
  };

  const selectAllFilters = () => {
    const allFilters = {};
    FILTER_CONDITIONS[type].forEach(condition => {
      allFilters[condition.id] = true;
    });
    setActiveFilters(allFilters);
  };

  const activeFilters_count = Object.values(activeFilters).filter(Boolean).length;

  const conditions = type === 'buy' ? FILTER_CONDITIONS.buy : FILTER_CONDITIONS.sell;
  const groupedConditions = useMemo(() => {
    const grouped = {};
    conditions.forEach(condition => {
      if (!grouped[condition.section]) grouped[condition.section] = [];
      grouped[condition.section].push(condition);
    });
    return grouped;
  }, [conditions]);

  return (
    <FilterContainer>
      <FilterHeader>
        <FilterTitle style={{ color: type === 'buy' ? '#10b981' : '#ef4444' }}>
          {type === 'buy' ? '📈 Buy Filters' : '📉 Sell Filters'}
        </FilterTitle>
        <ActionButtons>
          <ActionButton onClick={selectAllFilters}>✅ All</ActionButton>
          <ActionButton variant="clear" onClick={clearAllFilters}>🗑️ Clear</ActionButton>
        </ActionButtons>
      </FilterHeader>

      <StatsBar>
        <StatItem>
          <div className="value">{filteredResults.length}</div>
          <div className="label">Matches</div>
        </StatItem>
        <StatItem>
          <div className="value">{activeFilters_count}</div>
          <div className="label">Active</div>
        </StatItem>
      </StatsBar>

      <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
        {Object.entries(groupedConditions).map(([sectionName, conditions]) => (
          <FilterSection key={sectionName}>
            <SectionHeader>{sectionName}</SectionHeader>
            <CheckboxGroup>
              {conditions.map(condition => (
                <CheckboxItem key={condition.id}>
                  <Checkbox
                    type="checkbox"
                    checked={activeFilters[condition.id] || false}
                    onChange={(e) => handleFilterChange(condition.id, e.target.checked)}
                  />
                  {condition.label}
                </CheckboxItem>
              ))}
            </CheckboxGroup>
          </FilterSection>
        ))}
      </div>
    </FilterContainer>
  );
};

export default FilterPanel;