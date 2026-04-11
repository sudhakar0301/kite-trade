import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

// Animation for live tracker masking indicator
const pulse = keyframes`
  0% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.02); }
  100% { opacity: 0.6; transform: scale(1); }
`;

// Styled component for masking badge
const MaskingBadge = styled.span`
  margin-left: 10px;
  padding: 4px 8px;
  background: linear-gradient(45deg, rgba(255, 215, 0, 0.2), rgba(255, 165, 0, 0.1));
  border: 1px solid rgba(255, 215, 0, 0.6);
  border-radius: 12px;
  font-size: 10px;
  color: #ffd700;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  animation: ${pulse} 2s ease-in-out infinite;
`;

const TrackerContainer = styled.div`
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid #333;
  border-radius: 12px;
  margin: 20px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
`;

const TrackerHeader = styled.div`
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  padding: 15px 20px;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const TrackerBody = styled.div`
  padding: 20px;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 20px;
  align-items: start;
`;



const OrderLevel = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isBest', 'side'].includes(prop),
})`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${props => props.isBest ? '8px 10px' : '6px 10px'};
  background: ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.15)` : 
    'rgba(255, 255, 255, 0.05)'};
  border: 1px solid ${props => props.isBest ? 
    `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.4)` : 
    'rgba(255, 255, 255, 0.08)'};
  border-radius: 4px;
  font-size: ${props => props.isBest ? '14px' : '13px'};
  font-weight: ${props => props.isBest ? '700' : '600'};
  min-height: 32px;
  
  &:hover {
    background: ${props => props.isBest ? 
      `rgba(${props.side === 'buy' ? '0, 255, 0' : '255, 107, 107'}, 0.25)` : 
      'rgba(255, 255, 255, 0.1)'};
  }
`;

const BestLabel = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
  font-size: 10px;
  color: ${props => props.side === 'buy' ? '#00ff88' : '#ff5555'};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 3px;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const LevelIndex = styled.div`
  color: #c9d1d9;
  font-size: 11px;
  font-weight: 600;
  min-width: 20px;
`;

const LevelPrice = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== 'side',
})`
  color: ${props => props.side === 'buy' ? '#00ff88' : '#ff5555'};
  font-weight: 700;
  font-size: 13px;
  flex: 1;
  text-align: center;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;

const LevelQuantity = styled.div`
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  min-width: 50px;
  text-align: right;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
`;



const NoDataMessage = styled.div`
  text-align: center;
  color: #ff6b6b;
  font-size: 14px;
  padding: 20px;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.3);
  border-radius: 8px;
  margin: 10px;
`;



const SubscribedStockTracker = ({ tickData }) => {
  // State to track currently selected stock symbol
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  
  // State to trigger re-renders for countdown timer
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // Refs to avoid infinite loops
  const symbolTimestampsRef = useRef({});
  const previousSymbolsRef = useRef(new Set());
  const symbolsAtSelectionRef = useRef({}); // Track which symbols existed when each symbol was selected
  
  // Complete Symbol to Token mapping (NSE symbols with Kite instrument tokens)
  const symbolToTokenMap = {
    '360ONE': '3343617',
    '3MINDIA': '121345',
    'ABB': '3329',
    'ACC': '5633',
    'ACMESOLAR': '6927617',
    'AIAENG': '3350017',
    'APLAPOLLO': '6599681',
    'AUBANK': '5436929',
    'AWL': '2076161',
    'AADHARHFC': '6074625',
    'AARTIIND': '1793',
    'AAVAS': '1378561',
    'ABBOTINDIA': '4583169',
    'ACE': '3478273',
    'ADANIENSOL': '2615553',
    'ADANIENT': '6401',
    'ADANIGREEN': '912129',
    'ADANIPORTS': '3861249',
    'ADANIPOWER': '4451329',
    'ATGL': '1552897',
    'ABCAPITAL': '5533185',
    'ABFRL': '7707649',
    'ABLBL': '193751809',
    'ABREL': '160001',
    'ABSLAMC': '1540609',
    'AEGISLOG': '10241',
    'AEGISVOPAK': '193878017',
    'AFCONS': '6650113',
    'AFFLE': '2903809',
    'AJANTPHARM': '2079745',
    'AKUMS': '6327041',
    'AKZOINDIA': '375553',
    'APLLTD': '6483969',
    'ALKEM': '2995969',
    'ALKYLAMINE': '1148673',
    'ALOKINDS': '4524801',
    'ARE&M': '25601',
    'AMBER': '303361',
    'AMBUJACEM': '325121',
    'ANANDRATHI': '1829121',
    'ANANTRAJ': '3486721',
    'ANGELONE': '82945',
    'APARINDS': '2941697',
    'APOLLOHOSP': '40193',
    'APOLLOTYRE': '41729',
    'APTUS': '1391361',
    'ASAHIINDIA': '1376769',
    'ASHOKLEY': '54273',
    'ASIANPAINT': '60417',
    'ASTERDM': '386049',
    'ASTRAZEN': '1436161',
    'ASTRAL': '3691009',
    'ATHERENERG': '193957121',
    'ATUL': '67329',
    'AUROPHARMA': '70401',
    'AIIL': '6029569',
    'DMART': '5097729',
    'AXISBANK': '1510401',
    'BASF': '94209',
    'BEML': '101121',
    'BLS': '4423425',
    'BSE': '5013761',
    'BAJAJ-AUTO': '4267265',
    'BAJFINANCE': '81153',
    'BAJAJFINSV': '4268801',
    'BAJAJHLDNG': '78081',
    'BAJAJHFL': '6469121',
    'BALKRISIND': '85761',
    'BALRAMCHIN': '87297',
    'BANDHANBNK': '579329',
    'BANKBARODA': '1195009',
    'BANKINDIA': '1214721',
    'MAHABANK': '2912513',
    'BATAINDIA': '94977',
    'BAYERCROP': '4589313',
    'BERGEPAINT': '103425',
    'BDL': '548865',
    'BEL': '98049',
    'BHARATFORG': '108033',
    'BHEL': '112129',
    'BPCL': '134657',
    'BHARTIARTL': '2714625',
    'BHARTIHEXA': '6013185',
    'BIKAJI': '3063297',
    'BIOCON': '2911489',
    'BSOFT': '1790465',
    'BLUEDART': '126721',
    'BLUEJET': '5039617',
    'BLUESTARCO': '2127617',
    'BBTC': '97281',
    'BOSCHLTD': '558337',
    'FIRSTCRY': '6352385',
    'BRIGADE': '3887105',
    'BRITANNIA': '140033',
    'MAPMYINDIA': '1850113',
    'CCL': '2931713',
    'CESC': '160769',
    'CGPOWER': '194561',
    'CRISIL': '193793',
    'CAMPUS': '2396673',
    'CANFINHOME': '149249',
    'CANBK': '2763265',
    'CAPLIPOINT': '999937',
    'CGCL': '5204225',
    'CARBORUNIV': '152321',
    'CASTROLIND': '320001',
    'CEATLTD': '3905025',
    'CENTRALBK': '3812865',
    'CDSL': '5420545',
    'CENTURYPLY': '3406081',
    'CERA': '3849985',
    'CHALET': '2187777',
    'CHAMBLFERT': '163073',
    'CHENNPETRO': '524545',
    'CHOICEIN': '2269697',
    'CHOLAHLDNG': '5565441',
    'CHOLAFIN': '175361',
    'CIPLA': '177665',
    'CUB': '1459457',
    'CLEAN': '1292545',
    'COALINDIA': '5215745',
    'COCHINSHIP': '5506049',
    'COFORGE': '2955009',
    'COHANCE': '4593921',
    'COLPAL': '3876097',
    'CAMS': '87553',
    'CONCORDBIO': '4623361',
    'CONCOR': '1215745',
    'COROMANDEL': '189185',
    'CRAFTSMAN': '730625',
    'CREDITACC': '1131777',
    'CROMPTON': '4376065',
    'CUMMINSIND': '486657',
    'CYIENT': '1471489',
    'DCMSHRIRAM': '207617',
    'DLF': '3771393',
    'DOMS': '5261057',
    'DABUR': '197633',
    'DALBHARAT': '2067201',
    'DATAPATTNS': '1883649',
    'DEEPAKFERT': '211713',
    'DEEPAKNTR': '5105409',
    'DELHIVERY': '2457345',
    'DEVYANI': '1375489',
    'DIVISLAB': '2800641',
    'DIXON': '5552641',
    'AGARWALEYE': '7539713',
    'LALPATHLAB': '2983425',
    'DRREDDY': '225537',
    'EIDPARRY': '234497',
    'EIHOTEL': '235265',
    'EICHERMOT': '232961',
    'ELECON': '3492609',
    'ELGIEQUIP': '239873',
    'EMAMILTD': '3460353',
    'EMCURE': '6245889',
    'ENDURANCE': '4818433',
    'ENGINERSIN': '1256193',
    'ERIS': '5415425',
    'ESCORTS': '245249',
    'ETERNAL': '1304833',
    'EXIDEIND': '173057',
    'NYKAA': '1675521',
    'FEDERALBNK': '261889',
    'FACT': '258049',
    'FINCABLES': '265729',
    'FINPIPE': '266497',
    'FSL': '3661825',
    'FIVESTAR': '3080193',
    'FORCEMOT': '2962689',
    'FORTIS': '3735553',
    'GAIL': '1207553',
    'GVT&D': '4296449',
    'GMRAIRPORT': '3463169',
    'GRSE': '1401601',
    'GICRE': '70913',
    'GILLETTE': '403457',
    'GLAND': '303617',
    'GLAXO': '295169',
    'GLENMARK': '1895937',
    'MEDANTA': '3060737',
    'GODIGIT': '6092545',
    'GPIL': '3432705',
    'GODFRYPHLP': '302337',
    'GODREJAGRO': '36865',
    'GODREJCP': '2585345',
    'GODREJIND': '2796801',
    'GODREJPROP': '4576001',
    'GRANULES': '3039233',
    'GRAPHITE': '151553',
    'GRASIM': '315393',
    'GRAVITA': '5256705',
    'GESHIP': '3526657',
    'FLUOROCHEM': '3520001',
    'GUJGASLTD': '2713345',
    'GMDCLTD': '1332225',
    'GSPL': '3378433',
    'HEG': '342017',
    'HBLENGINE': '3575297',
    'HCLTECH': '1850625',
    'HDFCAMC': '1086465',
    'HDFCBANK': '341249',
    'HDFCLIFE': '119553',
    'HFCL': '5619457',
    'HAPPSTMNDS': '12289',
    'HAVELLS': '2513665',
    'HEROMOTOCO': '345089',
    'HEXT': '7594497',
    'HSCL': '3669505',
    'HINDALCO': '348929',
    'HAL': '589569',
    'HINDCOPPER': '4592385',
    'HINDPETRO': '359937',
    'HINDUNILVR': '356865',
    'HINDZINC': '364545',
    'POWERINDIA': '4724993',
    'HOMEFIRST': '526337',
    'HONASA': '5072129',
    'HONAUT': '874753',
    'HUDCO': '5331201',
    'HYUNDAI': '6616065',
    'ICICIBANK': '1270529',
    'ICICIGI': '5573121',
    'ICICIPRULI': '4774913',
    'IDBI': '377857',
    'IDFCFIRSTB': '2863105',
    'IFCI': '381697',
    'IIFL': '3023105',
    'INOXINDIA': '5275393',
    'IRB': '3920129',
    'IRCON': '1276417',
    'ITCHOTELS': '7488257',
    'ITC': '424961',
    'ITI': '428801',
    'INDGN': '6065409',
    'INDIACEM': '387841',
    'INDIAMART': '2745857',
    'INDIANB': '3663105',
    'IEX': '56321',
    'INDHOTEL': '387073',
    'IOC': '415745',
    'IOB': '2393089',
    'IRCTC': '3484417',
    'IRFC': '519425',
    'IREDA': '5186817',
    'IGL': '2883073',
    'INDUSTOWER': '7458561',
    'INDUSINDBK': '1346049',
    'NAUKRI': '3520257',
    'INFY': '408065',
    'INOXWIND': '2010113',
    'INTELLECT': '1517057',
    'INDIGO': '2865921',
    'IGIL': '7264769',
    'IKS': '7200001',
    'IPCALAB': '418049',
    'JBCHEPHARM': '441857',
    'JKCEMENT': '3397121',
    'JBMA': '2983681',
    'JKTYRE': '3695361',
    'JMFINANCIL': '3491073',
    'JSWCEMENT': '194165761',
    'JSWENERGY': '4574465',
    'JSWINFRA': '4869121',
    'JSWSTEEL': '3001089',
    'JPPOWER': '3011329',
    'J&KBANK': '1442049',
    'JINDALSAW': '774145',
    'JSL': '2876417',
    'JINDALSTEL': '1723649',
    'JIOFIN': '4644609',
    'JUBLFOOD': '4632577',
    'JUBLINGREA': '712449',
    'JUBLPHARMA': '931073',
    'JWL': '5177345',
    'JYOTHYLAB': '3877377',
    'JYOTICNC': '5461505',
    'KPRMILL': '3817473',
    'KEI': '3407361',
    'KPITTECH': '2478849',
    'KSB': '498945',
    'KAJARIACER': '462849',
    'KPIL': '464385',
    'KALYANKJIL': '756481',
    'KARURVYSYA': '470529',
    'KAYNES': '3095553',
    'KEC': '3394561',
    'KFINTECH': '3419905',
    'KIRLOSBROS': '4756737',
    'KIRLOSENG': '5359617',
    'KOTAKBANK': '492033',
    'KIMS': '1240833',
    'LTF': '6386689',
    'LTTS': '4752385',
    'LICHSGFIN': '511233',
    'LTFOODS': '3536897',
    'LTM': '4561409',
    'LT': '2939649',
    'LATENTVIEW': '1745409',
    'LAURUSLABS': '4923905',
    'THELEELA': '193795585',
    'LEMONTREE': '667137',
    'LICI': '2426881',
    'LINDEINDIA': '416513',
    'LLOYDSME': '4432129',
    'LODHA': '824321',
    'LUPIN': '2672641',
    'MMTC': '4596993',
    'MRF': '582913',
    'MGL': '4488705',
    'MAHSCOOTER': '533761',
    'MAHSEAMLES': '534529',
    'M&MFIN': '3400961',
    'M&M': '519937',
    'MANAPPURAM': '4879617',
    'MRPL': '584449',
    'MANKIND': '3937281',
    'MARICO': '1041153',
    'MARUTI': '2815745',
    'MFSL': '548353',
    'MAXHEALTH': '5728513',
    'MAZDOCK': '130305',
    'METROPOLIS': '2452737',
    'MINDACORP': '6629633',
    'MSUMI': '2200577',
    'MOTILALOFS': '3826433',
    'MPHASIS': '1152769',
    'MCX': '7982337',
    'MUTHOOTFIN': '6054401',
    'NATCOPHARM': '1003009',
    'NBCC': '8042241',
    'NCC': '593665',
    'NHPC': '4454401',
    'NLCINDIA': '2197761',
    'NMDC': '3924993',
    'NSLNISP': '3630081',
    'NTPCGREEN': '6957057',
    'NTPC': '2977281',
    'NH': '3031041',
    'NATIONALUM': '1629185',
    'NAVA': '1027585',
    'NAVINFLUOR': '3756033',
    'NESTLEIND': '4598529',
    'NETWEB': '4462849',
    'NEULANDLAB': '615937',
    'NEWGEN': '297985',
    'NAM-INDIA': '91393',
    'NIVABUPA': '6936833',
    'NUVAMA': '4792577',
    'NUVOCO': '1389057',
    'OBEROIRLTY': '5181953',
    'ONGC': '633601',
    'OIL': '4464129',
    'OLAELEC': '6342913',
    'OLECTRA': '2723073',
    'PAYTM': '1716481',
    'ONESOURCE': '7481345',
    'OFSS': '2748929',
    'POLICYBZR': '1703937',
    'PCBL': '678145',
    'PGEL': '6491649',
    'PIIND': '6191105',
    'PNBHOUSING': '4840449',
    'PTCIL': '4270593',
    'PVRINOX': '3365633',
    'PAGEIND': '3689729',
    'PATANJALI': '4359425',
    'PERSISTENT': '4701441',
    'PETRONET': '2905857',
    'PFIZER': '676609',
    'PHOENIXLTD': '3725313',
    'PIDILITIND': '681985',
    'PPLPHARMA': '2962177',
    'POLYMED': '6583809',
    'POLYCAB': '2455041',
    'POONAWALLA': '2919169',
    'PFC': '3660545',
    'POWERGRID': '3834113',
    'PRAJIND': '692481',
    'PREMIERENE': '6412545',
    'PRESTIGE': '5197313',
    'PGHH': '648961',
    'PNB': '2730497',
    'RRKABEL': '4752897',
    'RBLBANK': '4708097',
    'RECLTD': '3930881',
    'RHIM': '7977729',
    'RITES': '962817',
    'RADICO': '2813441',
    'RVNL': '2445313',
    'RAILTEL': '622337',
    'RAINBOW': '2408449',
    'RKFORGE': '2921217',
    'RCF': '733697',
    'RPOWER': '772609',
    'RELIANCE': '738561',
    'RITES': '962817',
    'RSMML': '2077185',
    'RSYSTEMS': '6051073',
    'RTNINDIA': '3705089',
    'RTNPOWER': '139521',
    'RCOM': '746753',
    'SAIL': '758529',
    'SJVN': '2970881',
    'SKFINDIA': '773121',
    'SRF': '857857',
    'SCHAEFFLER': '4914433',
    'SCHNEIDER': '775169',
    'SCI': '778497',
    'SHANKARA': '1194753',
    'SHAREINDIA': '5107457',
    'SHREECEM': '794113',
    'SHRIRAMFIN': '4078849',
    'SHYAMMETL': '1027329',
    'SIEMENS': '784129',
    'SIL': '819201',
    'SBIN': '779521',
    'SONACOMS': '960513',
    'SPANDANA': '1030913',
    'SPARC': '793857',
    'STARHEALTH': '1073921',
    'SUMICHEM': '2017281',
    'SUNTECK': '2856961',
    'SUNTV': '838401',
    'SUPREMEIND': '847617',
    'SUZLON': '857601',
    'SWANENERGY': '1123073',
    'SYMPHONY': '3985409',
    'SYNGENE': '4475137',
    'TVSMOTOR': '900609',
    'TATACHEM': '5505',
    'TATACOMM': '1895169',
    'TATAGOLD': '4359169',
    'TATAMOTORS': '884737',
    'TATAPOWER': '877825',
    'TATASTEEL': '895745',
    'TCS': '2953217',
    'TECHM': '3465729',
    'TEJASNET': '5347329',
    'THERMAX': '513793',
    'THYROCARE': '1123329',
    'TIINDIA': '919297',
    'TITAN': '897537',
    'TRIVENI': '936961',
    'UCOBANK': '2675969',
    'UBL': '2889473',
    'UNIONBANK': '5448961',
    'UPL': '512257',
    'UTIAMC': '2984193',
    'VEDL': '784641',
    'VGUARD': '5334017',
    'VIPIND': '970753',
    'VOLTAS': '969473',
    'WELCORP': '1007105',
    'WIPRO': '975873',
    'YESBANK': '3050241',
    'ZEEL': '975105',
    'ZOMATO': '1134849'
  };

  // Get all available symbols (including those without live data yet, e.g., just subscribed)
  const getAllAvailableSymbols = useCallback(() => {
    if (!tickData) {
      console.log('🔍 No tickData available for symbol detection');
      return [];
    }
    
    // tickData contains all subscribed symbols as keys, even those without recent messages
    const allSymbols = Object.keys(tickData);
    console.log('🔍 getAllAvailableSymbols result:', allSymbols);
    
    return allSymbols;
  }, [tickData]);

  // Get stocks that have actual live data (messages in their arrays)
  const getSubscribedStocks = useCallback(() => {
    if (!tickData) {
      console.log('🔍 No tickData available');
      return [];
    }
    
    const stocks = Object.keys(tickData).filter(symbol => {
      const history = tickData[symbol];
      const hasData = history && history.length > 0;
      console.log(`🔍 Stock ${symbol}: hasData=${hasData}, arrayLength=${history?.length || 0}`);
      return hasData;
    });
    
    console.log('🔍 getSubscribedStocks result:', stocks);
    return stocks;
  }, [tickData]);

  // Enhanced chart URL function with better debugging
  const getKiteChartUrl = (symbol) => {
    console.log('🔍 getKiteChartUrl called with:', symbol, 'Type:', typeof symbol);
    
    if (!symbol) {
      console.log('🔍 No symbol provided to getKiteChartUrl');
      return null;
    }
    
    // Clean the symbol (remove NSE: prefix if present)
    const cleanSymbol = typeof symbol === 'string' ? symbol.replace('NSE:', '') : String(symbol);
    console.log('🔍 Clean symbol:', cleanSymbol);
    
    // Look up the token from our mapping
    const token = symbolToTokenMap[cleanSymbol];
    console.log('🔍 Token lookup for', cleanSymbol, '- Found:', token);
    
    if (!token) {
      console.log('🔍 ❌ No token found for symbol:', cleanSymbol);
      console.log('🔍 Available tokens sample:', Object.keys(symbolToTokenMap).slice(0, 10));
      return null;
    }
    
    // Construct NSE chart URL
    const chartUrl = `https://kite.zerodha.com/markets/ext/chart/web/tvc/NSE/${cleanSymbol}/${token}`;
    console.log('🔍 ✅ Generated chart URL:', chartUrl);
    
    return chartUrl;
  };

  useEffect(() => {
    const subscribedStocks = getSubscribedStocks();
    const allAvailableSymbols = getAllAvailableSymbols();
    console.log('🔍 Currently subscribed stocks:', subscribedStocks);
    console.log('🔍 All available symbols:', allAvailableSymbols);
    
    // Check for newly subscribed symbols (including those without data yet)
    const newSymbols = allAvailableSymbols.filter(symbol => !previousSymbolsRef.current.has(symbol));
    
    console.log('🔍 Symbol detection debug:');
    console.log('  - Previous symbols:', Array.from(previousSymbolsRef.current));
    console.log('  - Current available:', allAvailableSymbols);
    console.log('  - Detected new symbols:', newSymbols);
    
    if (newSymbols.length > 0) {
      console.log('🔍 ✨ NEW SYMBOLS DETECTED:', newSymbols);
      console.log('🔍 Current selectedSymbol:', selectedSymbol);
      console.log('🔍 Current symbolTimestampsRef:', symbolTimestampsRef.current);
      
      // Check if current symbol can be changed (2 minutes elapsed or no current symbol)
      const currentTime = Date.now();
      const canChangeSymbol = !selectedSymbol || 
        !symbolTimestampsRef.current[selectedSymbol] || 
        (currentTime - symbolTimestampsRef.current[selectedSymbol] >= 2 * 60 * 1000); // 2 minutes in milliseconds
      
      if (canChangeSymbol) {
        // Switch to the most recently subscribed new symbol
        const newSymbol = newSymbols[newSymbols.length - 1];
        console.log('🔍 🔄 Switching to new symbol:', newSymbol);
        setSelectedSymbol(newSymbol);
        
        // Auto-open chart in reusable tab for new symbol - Enhanced debugging
        console.log('🚀 Attempting auto-chart open for:', newSymbol);
        console.log('🔍 Symbol format check - Original:', newSymbol, 'Type:', typeof newSymbol);
        
        const chartUrl = getKiteChartUrl(newSymbol);
        console.log('🔍 Chart URL result:', chartUrl);
        
        if (chartUrl) {
          console.log('🚀 AUTO-OPENING CHART NOW for:', newSymbol, 'URL:', chartUrl);
          
          // Try to open chart with popup blocker detection
          try {
            const newTab = window.open(chartUrl, 'kite-chart-tab'); // Named tab - reuses same tab
            if (newTab) {
              console.log('✅ Chart opened in reusable tab for:', newSymbol.replace('NSE:', ''));
              // Focus the chart tab to bring it to front
              newTab.focus();
            } else {
              console.error('❌ Popup blocked! Enable popups for automatic chart opening');
              // Show alert as fallback
              alert(`📊 Chart blocked by popup blocker!\nClick OK to open chart for ${newSymbol.replace('NSE:', '')}\n\nURL: ${chartUrl}`);
            }
          } catch (error) {
            console.error('❌ Error opening chart:', error);
          }
        } else {
          console.log('⚠️ No chart URL available for:', newSymbol);
          console.log('🔍 Debug: Checking token mapping for symbol:', newSymbol.replace('NSE:', ''));
        }
        
        // Update timestamp for the new symbol
        const newTimestamps = {
          ...symbolTimestampsRef.current,
          [newSymbol]: currentTime
        };
        symbolTimestampsRef.current = newTimestamps;
        
        // Record which symbols existed when this symbol was selected
        symbolsAtSelectionRef.current[newSymbol] = new Set(allAvailableSymbols);
      } else {
        // Current symbol is still in its 2-minute display period
        const timeRemaining = 2 * 60 * 1000 - (currentTime - symbolTimestampsRef.current[selectedSymbol]);
        console.log('🔍 ⏰ Current symbol still has', Math.ceil(timeRemaining / 1000), 'seconds remaining. New symbols will queue.');
      }
    }
    
    // If no selectedSymbol yet, or if current selectedSymbol is no longer available
    if (!selectedSymbol || !allAvailableSymbols.includes(selectedSymbol)) {
      // Prefer symbols with actual data, but show any available symbol
      const symbolToSelect = subscribedStocks.length > 0 ? subscribedStocks[0] : 
                            allAvailableSymbols.length > 0 ? allAvailableSymbols[0] : null;
      
      if (symbolToSelect) {
        console.log('🔍 🔄 Switching to available stock:', symbolToSelect);
        setSelectedSymbol(symbolToSelect);
        
        // Set timestamp for this symbol
        const currentTime = Date.now();
        const newTimestamps = {
          ...symbolTimestampsRef.current,
          [symbolToSelect]: currentTime
        };
        symbolTimestampsRef.current = newTimestamps;
        
        // Record which symbols existed when this symbol was selected
        symbolsAtSelectionRef.current[symbolToSelect] = new Set(allAvailableSymbols);
      } else {
        console.log('🔍 ❌ No available stocks');
        setSelectedSymbol(null);
      }
    }
    
    // Update previous symbols set
    const newSymbolsSet = new Set(allAvailableSymbols);
    console.log('🔍 Updating previousSymbolsRef from:', Array.from(previousSymbolsRef.current), 'to:', Array.from(newSymbolsSet));
    previousSymbolsRef.current = newSymbolsSet;
    
    // Cleanup old timestamps and selection records (symbols that are no longer available)
    const cleanedTimestamps = { ...symbolTimestampsRef.current };
    Object.keys(cleanedTimestamps).forEach(symbol => {
      if (!allAvailableSymbols.includes(symbol)) {
        delete cleanedTimestamps[symbol];
        delete symbolsAtSelectionRef.current[symbol]; // Also cleanup selection records
      }
    });
    symbolTimestampsRef.current = cleanedTimestamps;
    
  }, [tickData, selectedSymbol, getAllAvailableSymbols, getSubscribedStocks, getKiteChartUrl]);
  
  // Effect to notify backend about selected symbol changes for masking
  useEffect(() => {
    const updateLiveTrackerSymbol = async () => {
      try {
        console.log(`🎯 FRONTEND: Updating live tracker symbol for masking: '${selectedSymbol || 'none'}'`);
        console.log(`🎯 FRONTEND: Selected Symbol Type: ${typeof selectedSymbol}, Value: '${selectedSymbol}'`);
        
        const response = await fetch('http://localhost:5000/api/set-live-tracker-symbol', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            symbol: selectedSymbol
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`✅ FRONTEND: Live tracker masking ${result.maskingActive ? 'ENABLED' : 'DISABLED'} for symbol: '${selectedSymbol || 'none'}'`);
          console.log(`✅ FRONTEND: Backend response:`, result);
        } else {
          console.warn('⚠️ FRONTEND: Failed to update live tracker symbol for masking - Response not OK');
        }
      } catch (error) {
        console.error('❌ FRONTEND: Error updating live tracker symbol:', error);
      }
    };
    
    // Update backend with current selected symbol (or null if none selected)
    updateLiveTrackerSymbol();
  }, [selectedSymbol]); // Run whenever selectedSymbol changes
  
  // Effect to automatically check for symbol changes after 2-minute periods
  useEffect(() => {
    if (!selectedSymbol || !symbolTimestampsRef.current[selectedSymbol]) return;
    
    const timeElapsed = Date.now() - symbolTimestampsRef.current[selectedSymbol];
    const timeRemaining = 2 * 60 * 1000 - timeElapsed;
    
    if (timeRemaining > 0) {
      // Set a timer to check for new symbols after the 2-minute period
      const timer = setTimeout(() => {
        // Check if there are NEWLY SUBSCRIBED symbols (not existing ones)
        const allSymbols = getAllAvailableSymbols();
        const symbolsAtSelection = symbolsAtSelectionRef.current[selectedSymbol] || new Set();
        
        // Find symbols that exist now but didn't exist when current symbol was selected
        const newlySubscribedSymbols = allSymbols.filter(symbol => 
          !symbolsAtSelection.has(symbol) && // Wasn't available when current symbol was selected
          symbolTimestampsRef.current[symbol] && // Has a timestamp (was subscribed at some point)
          symbolTimestampsRef.current[symbol] > symbolTimestampsRef.current[selectedSymbol] // Was subscribed after current symbol
        );
        
        if (newlySubscribedSymbols.length > 0) {
          const newestSymbol = newlySubscribedSymbols.reduce((newest, symbol) => 
            symbolTimestampsRef.current[symbol] > symbolTimestampsRef.current[newest] ? symbol : newest
          );
          
          console.log('🔍 ⏰ 2 minutes elapsed. Switching to newly subscribed symbol:', newestSymbol);
          setSelectedSymbol(newestSymbol);
        } else {
          console.log('🔍 ⏰ 2 minutes elapsed but no newly subscribed symbols found. Staying with current symbol:', selectedSymbol);
        }
      }, timeRemaining);
      
      return () => clearTimeout(timer);
    }
  }, [selectedSymbol, getAllAvailableSymbols]);
  
  // Effect to update current time every second for countdown display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Get stock data for the currently selected symbol
  const getAvailableStockData = () => {
    if (!tickData || !selectedSymbol) {
      return { data: null, symbol: null, hasSymbol: false, isWaitingForData: false };
    }
    
    const history = tickData[selectedSymbol];
    const hasSymbol = tickData.hasOwnProperty(selectedSymbol);
    const isWaitingForData = hasSymbol && (!history || history.length === 0);
    
    if (history && history.length > 0) {
      // Get the latest tick (last item in the array)
      const latestTick = history[history.length - 1];
      console.log('🔍 Latest tick for', selectedSymbol, ':', latestTick);
      console.log('🔍 ✅ Using selected stock:', selectedSymbol, 'with data:', latestTick);
      return { data: latestTick, symbol: selectedSymbol, hasSymbol: true, isWaitingForData: false };
    }
    
    if (isWaitingForData) {
      console.log('🔍 ⏳ Symbol subscribed but waiting for data:', selectedSymbol);
      return { data: null, symbol: selectedSymbol, hasSymbol: true, isWaitingForData: true };
    }
    
    console.log('🔍 ❌ No data for selected stock:', selectedSymbol);
    return { data: null, symbol: null, hasSymbol: false, isWaitingForData: false };
  };

  const { data: stockData, symbol: currentSymbol, hasSymbol, isWaitingForData } = getAvailableStockData();

  // Calculate remaining display time for current symbol
  const getTimeRemaining = () => {
    if (!selectedSymbol || !symbolTimestampsRef.current[selectedSymbol]) return null;
    
    const timeElapsed = currentTime - symbolTimestampsRef.current[selectedSymbol];
    const timeRemaining = 2 * 60 * 1000 - timeElapsed; // 2 minutes in milliseconds
    
    return timeRemaining > 0 ? Math.ceil(timeRemaining / 1000) : 0; // Return seconds
  };

  const formatPrice = (price) => {
    return price ? `₹${parseFloat(price).toFixed(2)}` : 'N/A';
  };

  const formatQuantity = (qty) => {
    if (!qty) return '0';
    if (qty >= 1000000) return `${(qty / 1000000).toFixed(1)}M`;
    if (qty >= 1000) return `${(qty / 1000).toFixed(0)}K`;
    return qty.toString();
  };

  // Calculate order book analytics for first 5, 10, and 20 levels
  const calculateOrderBookAnalytics = () => {
    if (!stockData || !stockData.depth) {
      return {
        l5: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 },
        l10: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 },
        l20: { bidQtySum: 0, askQtySum: 0, imbalance: 0, spreadPercent: 0, bestBid: 0, bestAsk: 0 }
      };
    }

    const { buy = [], sell = [] } = stockData.depth;
    
    // Calculate for L1-5
    const bidQtySum5 = buy.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum5 = sell.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty5 = bidQtySum5 + askQtySum5;
    const imbalance5 = totalQty5 > 0 ? ((bidQtySum5 - askQtySum5) / totalQty5 * 100) : 0;
    
    // Calculate for L1-10
    const bidQtySum10 = buy.slice(0, 10).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum10 = sell.slice(0, 10).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty10 = bidQtySum10 + askQtySum10;
    const imbalance10 = totalQty10 > 0 ? ((bidQtySum10 - askQtySum10) / totalQty10 * 100) : 0;
    
    // Calculate for L1-20
    const bidQtySum20 = buy.slice(0, 20).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const askQtySum20 = sell.slice(0, 20).reduce((sum, level) => sum + (level?.quantity || 0), 0);
    const totalQty20 = bidQtySum20 + askQtySum20;
    const imbalance20 = totalQty20 > 0 ? ((bidQtySum20 - askQtySum20) / totalQty20 * 100) : 0;
    
    // Calculate average spread percentage for L1-5
    let spreadSum5 = 0;
    let validLevels5 = 0;
    for (let i = 0; i < Math.min(5, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum5 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels5++;
      }
    }
    const spreadPercent5 = validLevels5 > 0 ? spreadSum5 / validLevels5 : 0;
    
    // Calculate average spread percentage for L1-10
    let spreadSum10 = 0;
    let validLevels10 = 0;
    for (let i = 0; i < Math.min(10, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum10 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels10++;
      }
    }
    const spreadPercent10 = validLevels10 > 0 ? spreadSum10 / validLevels10 : 0;
    
    // Calculate average spread percentage for L1-20
    let spreadSum20 = 0;
    let validLevels20 = 0;
    for (let i = 0; i < Math.min(20, buy.length, sell.length); i++) {
      const bidPrice = buy[i]?.price || 0;
      const askPrice = sell[i]?.price || 0;
      if (bidPrice > 0 && askPrice > 0) {
        spreadSum20 += (askPrice - bidPrice) / bidPrice * 100;
        validLevels20++;
      }
    }
    const spreadPercent20 = validLevels20 > 0 ? spreadSum20 / validLevels20 : 0;
    
    // Get best bid and ask prices
    const bestBid = buy[0]?.price || 0;
    const bestAsk = sell[0]?.price || 0;
    
    return {
      l5: {
        bidQtySum: bidQtySum5,
        askQtySum: askQtySum5,
        imbalance: imbalance5,
        spreadPercent: spreadPercent5,
        bestBid: bestBid,
        bestAsk: bestAsk
      },
      l10: {
        bidQtySum: bidQtySum10,
        askQtySum: askQtySum10,
        imbalance: imbalance10,
        spreadPercent: spreadPercent10,
        bestBid: bestBid,
        bestAsk: bestAsk
      },
      l20: {
        bidQtySum: bidQtySum20,
        askQtySum: askQtySum20,
        imbalance: imbalance20,
        spreadPercent: spreadPercent20,
        bestBid: bestBid,
        bestAsk: bestAsk
      }
    };
  };



  return (
    <TrackerContainer>
      <TrackerHeader>
        🏛️ Live Stock Tracker - {currentSymbol ? currentSymbol.replace('NSE:', '') : 'No Stock'}
        {selectedSymbol && (
          <MaskingBadge>
            🎯 MASKING ACTIVE
          </MaskingBadge>
        )}
        
        {/* Market Impact Calculations Display */}
        {selectedSymbol && stockData?.depth?.marketImpact && (
          <div style={{ 
            marginLeft: '15px',
            padding: '6px 12px',
            background: 'rgba(255, 215, 0, 0.15)',
            border: '1px solid rgba(255, 215, 0, 0.4)',
            borderRadius: '8px',
            fontSize: '10px',
            color: '#ffd700',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span>📊 Qty: {stockData.depth.marketImpact.quantity?.toLocaleString()}</span>
            <span>🎯 Levels: {stockData.depth.marketImpact.impactedLevels}</span>
            <span>📈 Slippage: {stockData.depth.marketImpact.totalSlippage?.toFixed(3)}%</span>
            <span>💰 Avg Price: ₹{stockData.depth.marketImpact.avgExecutionPrice?.toFixed(2)}</span>
            <span>📋 L5: {(() => {
              const analytics = calculateOrderBookAnalytics();
              return `B:${analytics.l5.bidQtySum.toLocaleString()} | A:${analytics.l5.askQtySum.toLocaleString()}`;
            })()}</span>
          </div>
        )}
        
        <span style={{ marginLeft: 'auto', fontSize: '12px', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '15px' }}>
          {(() => {
            const timeRemaining = getTimeRemaining();
            return timeRemaining !== null && timeRemaining > 0 ? (
              <span style={{ 
                color: timeRemaining > 60 ? '#ffd700' : timeRemaining > 30 ? '#ff9500' : '#ff6b6b',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                ⏰ {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
              </span>
            ) : null;
          })()}
          {stockData ? (
            <span style={{ color: '#00ff00' }}>🟢 LIVE</span>
          ) : (
            <span style={{ color: '#ff6b6b' }}>🔴 NO DATA</span>
          )}
        </span>
      </TrackerHeader>

      {stockData || isWaitingForData ? (
        <TrackerBody>
          {/* Show waiting message when symbol is subscribed but no data yet */}
          {isWaitingForData && !stockData ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '40px 20px',
              background: 'rgba(255, 215, 0, 0.1)',
              border: '1px solid rgba(255, 215, 0, 0.3)', 
              borderRadius: '12px',
              margin: '20px',
              color: '#ffd700'
            }}>
              <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
                Loading live data for {currentSymbol}...
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                Symbol subscribed successfully - waiting for first tick data from exchange
              </div>
            </div>
          ) : null}
        </TrackerBody>
      ) : (
        <NoDataMessage>
          {hasSymbol ? (
            <>
              ⏳ Waiting for live data for {currentSymbol}... <br />
              <small style={{ color: '#ffd700' }}>Symbol subscribed - first tick data loading...</small>
            </>
          ) : (
            <>
              📡 Waiting for subscribed stock data... <br />
              <small>Start scanner to begin receiving tick updates</small>
            </>
          )}
          {(() => {
            const allSymbols = getAllAvailableSymbols();
            const queuedSymbols = allSymbols.filter(symbol => symbol !== selectedSymbol);
            
            if (queuedSymbols.length > 0) {
              return (
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#ffd700' }}>
                  🔄 Available symbols: {queuedSymbols.join(', ')}
                </div>
              );
            }
            return null;
          })()}
        </NoDataMessage>
      )}
      
      {/* All Subscribed Stocks Market Impact Table */}
      <div style={{
        marginTop: '20px',
        background: 'rgba(0, 0, 0, 0.8)',
        border: '1px solid rgba(255, 215, 0, 0.3)',
        borderRadius: '12px',
        padding: '15px',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#ffd700',
          marginBottom: '15px',
          textAlign: 'center',
          borderBottom: '1px solid rgba(255, 215, 0, 0.3)',
          paddingBottom: '10px'
        }}>
          📊 All Subscribed Stocks - Market Impact Dashboard ({Object.keys(tickData || {}).length})
        </div>
        
        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 60px 80px 80px 100px 120px 140px',
          gap: '8px',
          padding: '8px',
          fontSize: '11px',
          fontWeight: '600',
          color: '#ffd700',
          background: 'rgba(255, 215, 0, 0.1)',
          borderRadius: '6px',
          marginBottom: '8px'
        }}>
          <div>📈 Symbol</div>
          <div>🔄 Type</div>
          <div>📊 Qty</div>
          <div>🎯 Levels</div>
          <div>📈 Slippage</div>
          <div>💰 Avg Price</div>
          <div>📋 L5: Levels</div>
        </div>
        
        {/* Table Data - Only Subscribed Symbols with Live Data */}
        {Object.keys(tickData || {}).map(symbol => {
          const symbolData = tickData?.[symbol];
          const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
          const marketImpact = latestTick?.depth?.marketImpact;
          const scanType = latestTick?.scan_type || 'UNKNOWN';
          
          // Calculate L5 data for this specific symbol
          const l5Data = latestTick?.depth ? (() => {
            const { buy = [], sell = [] } = latestTick.depth;
            const bidQtySum5 = buy.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
            const askQtySum5 = sell.slice(0, 5).reduce((sum, level) => sum + (level?.quantity || 0), 0);
            return { bidQtySum5, askQtySum5 };
          })() : { bidQtySum5: 0, askQtySum5: 0 };
          
          // Color scheme based on scan type
          const scanColors = {
            BUY_SCAN: {
              bg: 'rgba(0, 255, 0, 0.1)',
              border: 'rgba(0, 255, 0, 0.3)',
              text: '#00ff00',
              bidColor: '#00ff00',
              askColor: '#ffaa00'
            },
            SELL_SCAN: {
              bg: 'rgba(255, 107, 107, 0.1)',
              border: 'rgba(255, 107, 107, 0.3)',
              text: '#ff6b6b',
              bidColor: '#ffaa00',
              askColor: '#ff6b6b'
            },
            UNKNOWN: {
              bg: 'rgba(255, 255, 255, 0.02)',
              border: 'transparent',
              text: '#888',
              bidColor: '#888',
              askColor: '#888'
            }
          };
          
          const colors = scanColors[scanType] || scanColors.UNKNOWN;
          
          return (
            <div
              key={symbol}
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 60px 80px 80px 100px 120px 140px',
                gap: '8px',
                padding: '8px',
                fontSize: '10px',
                background: symbol === selectedSymbol ? 
                  'rgba(255, 215, 0, 0.2)' : colors.bg,
                borderRadius: '4px',
                marginBottom: '4px',
                border: symbol === selectedSymbol ? 
                  '1px solid rgba(255, 215, 0, 0.5)' : 
                  `1px solid ${colors.border}`,
                cursor: 'pointer'
              }}
              onClick={() => {
                setSelectedSymbol(symbol);
                const chartUrl = getKiteChartUrl(symbol);
                if (chartUrl) {
                  window.open(chartUrl, 'kite-chart-tab');
                  console.log('🔍 Chart opened for:', symbol);
                }
              }}
            >
              <div style={{ 
                color: symbol === selectedSymbol ? '#ffd700' : '#79c0ff',
                fontWeight: symbol === selectedSymbol ? '600' : '400',
                fontSize: '11px'
              }}>
                {symbol.replace('NSE:', '')}
                {symbol === selectedSymbol && <span style={{ marginLeft: '4px' }}>🎯</span>}
              </div>
              
              <div style={{ 
                color: colors.text,
                fontSize: '9px',
                fontWeight: '600'
              }}>
                {scanType === 'BUY_SCAN' ? '🟢 BUY' : 
                 scanType === 'SELL_SCAN' ? '🔴 SELL' : '⚪ UNK'}
              </div>
              
              <div style={{ color: marketImpact ? '#00ff00' : '#888' }}>
                {marketImpact?.quantity ? marketImpact.quantity.toLocaleString() : '-'}
              </div>
              
              <div style={{ color: marketImpact ? '#00ff00' : '#888' }}>
                {marketImpact ? (
                  scanType === 'BUY_SCAN' ? (
                    // For BUY stocks, show ask-side levels (levels we need to consume)
                    <span style={{ color: colors.askColor }}>Ask: {marketImpact?.impactedLevels || '-'}</span>
                  ) : scanType === 'SELL_SCAN' ? (
                    // For SELL stocks, show bid-side levels (levels that will consume us)
                    <span style={{ color: colors.bidColor }}>Bid: {marketImpact?.impactedLevels || '-'}</span>
                  ) : (
                    // Unknown scan type
                    marketImpact?.impactedLevels || '-'
                  )
                ) : '-'}
              </div>
              
              <div style={{ color: marketImpact?.totalSlippage ? 
                (marketImpact.totalSlippage > 0.5 ? '#ff6b6b' : '#00ff00') : '#888' }}>
                {marketImpact?.totalSlippage ? 
                  `${marketImpact.totalSlippage.toFixed(3)}%` : '-'}
              </div>
              
              <div style={{ color: marketImpact ? '#ffd700' : '#888' }}>
                {marketImpact?.avgExecutionPrice ? 
                  `₹${marketImpact.avgExecutionPrice.toFixed(2)}` : '-'}
              </div>
              
              <div style={{ color: latestTick ? '#79c0ff' : '#888', fontSize: '9px' }}>
                {latestTick ? (
                  <span>
                    {scanType === 'BUY_SCAN' ? (
                      // For BUY stocks, show Ask levels (what we need to pay)
                      <span style={{ color: colors.askColor }}>Ask: {l5Data.askQtySum5}</span>
                    ) : scanType === 'SELL_SCAN' ? (
                      // For SELL stocks, show Bid levels (what buyers will pay us)
                      <span style={{ color: colors.bidColor }}>Bid: {l5Data.bidQtySum5}</span>
                    ) : (
                      // Unknown scan type, show both
                      <span>
                        <span style={{ color: colors.bidColor }}>Bid:{l5Data.bidQtySum5}</span>
                        {' | '}
                        <span style={{ color: colors.askColor }}>Ask:{l5Data.askQtySum5}</span>
                      </span>
                    )}
                  </span>
                ) : '-'}
              </div>
            </div>
          );
        })}
        
        {/* Summary Stats */}
        <div style={{
          marginTop: '15px',
          padding: '10px',
          background: 'rgba(255, 215, 0, 0.1)',
          borderRadius: '6px',
          borderTop: '1px solid rgba(255, 215, 0, 0.3)'
        }}>
          <div style={{ 
            fontSize: '11px', 
            color: '#ffd700', 
            fontWeight: '600',
            textAlign: 'center',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              📈 Total: {Object.keys(tickData || {}).length} symbols
            </div>
            <div style={{ display: 'flex', gap: '15px' }}>
              <span style={{ color: '#00ff00' }}>
                🟢 Buy: {Object.keys(tickData || {}).filter(symbol => {
                  const symbolData = tickData?.[symbol];
                  const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
                  return latestTick?.scan_type === 'BUY_SCAN';
                }).length}
              </span>
              <span style={{ color: '#ff6b6b' }}>
                🔴 Sell: {Object.keys(tickData || {}).filter(symbol => {
                  const symbolData = tickData?.[symbol];
                  const latestTick = symbolData && symbolData.length > 0 ? symbolData[symbolData.length - 1] : null;
                  return latestTick?.scan_type === 'SELL_SCAN';
                }).length}
              </span>
            </div>
            <div>
              {selectedSymbol ? ` Live: ${selectedSymbol.replace('NSE:', '')}` : ' No selection'} ⚡
            </div>
          </div>
        </div>
      </div>
    </TrackerContainer>
  );
};

export default SubscribedStockTracker;