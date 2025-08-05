// Test stop loss calculation to identify potential issues

const STOP_LOSS_AMOUNT = 500; // Fixed stop loss of 500

function testStopLossCalculation() {
    console.log('Testing Stop Loss Calculation\n');
    
    // Test scenarios
    const testCases = [
        { symbol: 'AARTIIND', buyPrice: 500, quantity: 1 },
        { symbol: 'AARTIIND', buyPrice: 500, quantity: 5 },
        { symbol: 'AARTIIND', buyPrice: 500, quantity: 10 },
        { symbol: 'RELIANCE', buyPrice: 2500, quantity: 1 },
        { symbol: 'RELIANCE', buyPrice: 2500, quantity: 2 },
        { symbol: 'LOWPRICE', buyPrice: 100, quantity: 1 },
        { symbol: 'LOWPRICE', buyPrice: 100, quantity: 10 },
    ];
    
    testCases.forEach(testCase => {
        const { symbol, buyPrice, quantity } = testCase;
        
        // Current calculation (potentially problematic)
        const currentStopPrice = buyPrice - (STOP_LOSS_AMOUNT / quantity);
        
        // Correct calculation should be: price per share that gives total loss of 500
        const correctStopPrice = buyPrice - (STOP_LOSS_AMOUNT / quantity);
        
        // Better calculation: percentage-based or per-share loss
        const perShareLoss = STOP_LOSS_AMOUNT / quantity;
        const betterStopPrice = buyPrice - perShareLoss;
        
        console.log(`${symbol}:`);
        console.log(`  Buy Price: ₹${buyPrice}, Quantity: ${quantity}`);
        console.log(`  Total Investment: ₹${buyPrice * quantity}`);
        console.log(`  Per Share Loss Required: ₹${perShareLoss.toFixed(2)}`);
        console.log(`  Stop Price: ₹${currentStopPrice.toFixed(2)}`);
        console.log(`  Actual Loss if triggered: ₹${(buyPrice - currentStopPrice) * quantity}`);
        console.log(`  Valid Stop Price: ${currentStopPrice > 0 ? 'YES' : 'NO (NEGATIVE!)'}`);
        console.log('');
    });
}

testStopLossCalculation();
