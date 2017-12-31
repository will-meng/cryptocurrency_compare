import moment from 'moment';

document.addEventListener('DOMContentLoaded', () => {
  const markets = {
    gdax: {
      on: true,
      pairs: ['ETH-BTC', 'LTC-BTC'],
      conjPairs: {
        'LTC/ETH': ['LTC-BTC', 'ETH-BTC', 'div'],
      },
      taker: 0.0025,
      maker: 0,
    },
    binance: {
      on: true,
      pairs: ['ethbtc', 'ltcbtc', 'ltceth', 'xrpeth', 'xrpbtc'],
      taker: 0.0005,
      maker: 0.0005,
    },
    hitbtc: {
      on: true,
      pairs: ['ETHBTC', 'LTCBTC', 'LTCETH', 'XRPBTC'],
      conjPairs: {
        'XRP/ETH': ['XRPBTC', 'ETHBTC', 'div'],
      },
      taker: 0.001,
      maker: 0.001,
    },
    bitstamp: {
      on: true,
      pairs: ['ethbtc', 'ltcbtc', 'xrpbtc'],
      conjPairs: {
        'LTC/ETH': ['ltcbtc', 'ethbtc', 'div'],
        'XRP/ETH': ['xrpbtc', 'ethbtc', 'div'],
      },
      taker: 0.0025,
      maker: 0.0025,
    },
  },
  pairDisplayNames = {
    'ETHBTC': 'ETH/BTC',
    'ETH-BTC': 'ETH/BTC',
    'ethbtc': 'ETH/BTC',

    'LTCBTC': 'LTC/BTC',
    'LTC-BTC': 'LTC/BTC',
    'ltcbtc': 'LTC/BTC',

    'LTC/ETH': 'LTC/ETH',
    'ltceth': 'LTC/ETH',
    'LTCETH': 'LTC/ETH',

    'XRPBTC': 'XRP/BTC',
    'xrpbtc': 'XRP/BTC',
    
    'XRP/ETH': 'XRP/ETH',
    'xrpeth': 'XRP/ETH',
  };

  function calculateMargins() {
    const margins = {
      'ETH/BTC': {}, // minPrice, maxPrice, minPriceMarket, maxPriceMarket, percent
      'LTC/BTC': {},
      'LTC/ETH': {},
      'XRP/BTC': {},
      'XRP/ETH': {},
    };

    function comparePrices(currencyPair, price, market) {
      let { minPrice, maxPrice, minPriceMarket, maxPriceMarket } = margins[currencyPair];

        if (!minPrice || price < minPrice) {
          margins[currencyPair].minPrice = price;
          margins[currencyPair].minPriceMarket = market;
        }
        if (!maxPrice || price > maxPrice) {
          margins[currencyPair].maxPrice = price;
          margins[currencyPair].maxPriceMarket = market;
        }
    }

    Object.keys(markets).forEach(market => {
      const curMarket = markets[market];
      curMarket.pairs.forEach(pair => {
        const currencyPair = pairDisplayNames[pair];
        const price = curMarket[pair];
        comparePrices(currencyPair, price, market);
      });

      if (curMarket.conjPairs) {
        const { conjPairs } = curMarket;
        Object.keys(conjPairs).forEach(currencyPair => {
          const price = curMarket[currencyPair];
          comparePrices(currencyPair, price, market);
        });
      }
    });

    let text = '';
    Object.keys(margins).forEach(pair => {
      const { minPrice, maxPrice, minPriceMarket, maxPriceMarket } = margins[pair],
      makerMult = 1 - markets[maxPriceMarket].maker,
      takerMult = 1 + markets[minPriceMarket].taker,
      grossPercent = ((maxPrice / minPrice - 1) * 100).toFixed(2),
      netPercent = ((maxPrice * makerMult / minPrice / takerMult - 1) * 100).toFixed(2);

      text += `${pair}: ${netPercent}%, min: ${minPrice} @ ${minPriceMarket}, max: ${maxPrice} @ ${maxPriceMarket}` + '\n';
    });

    const el = document.getElementById('margins');
    el.textContent = text;
    el.style.whiteSpace = 'pre';
  }

  if (markets.gdax.on) {
    const market = 'gdax';
    const productIds= markets[market].pairs;
    const channels = [{
      "name": "ticker",
      product_ids: productIds,
      side: "buy"
    }];

    // open websocket and subscribe
    const gdws = new WebSocket('wss://ws-feed.gdax.com');
    gdws.onopen = () => gdws.send(JSON.stringify({
      type: "subscribe",
      channels,
    }));

    // parse messages
    gdws.onmessage = onmsg => {
      const data = JSON.parse(onmsg.data);
      // console.log(data);

      if (data.type === 'ticker' && data.time) {
        log(
          market, 
          data.product_id, 
          parseFloat(data.price), 
          parseFloat(data.best_ask), 
          parseFloat(data.best_bid), 
          timeFromDate(data.time)
        );
        render(market);
      }
      
      // gdws.send(JSON.stringify({
      //   type: "unsubscribe",
      //   channels: ["ticker"]
      // }));
    };
  }

  if (markets.binance.on) {
    const market = 'binance';
    const webSockets = [];
    markets[market].pairs.forEach((pair, idx) => {
      webSockets.push(new WebSocket(`wss://stream.binance.com:9443/ws/${pair}@aggTrade`));
      // webSockets[idx].onopen = () => console.log(`opened aggTrade: ${pair}`);
      webSockets[idx].onmessage = onmsg => {
        const data = JSON.parse(onmsg.data);
        // console.log(data);

        let {
          e:eventType,
          E:eventTime,
          s:symbol,
          a:tradeId,
          p:price,
          q:qty,
          f:firstTradeId,
          l:lastTradeId,
          T:tradeTime,
          m:maker,
        } = data;

        log(
          market, 
          pair, 
          parseFloat(price), 
          null, 
          null, 
          timeFromDate(eventTime)
        );
        render(market);

      };
    });
  }

  if (markets.hitbtc.on) {
    const market = 'hitbtc';
    const hbws = new WebSocket('wss://api.hitbtc.com/api/2/ws');
   
    hbws.onopen = () => {
      markets[market].pairs.forEach(pair => {
        hbws.send(JSON.stringify({
          "method": "subscribeTrades",
          "params": { symbol: pair },
          "id": 123,
        }));
        hbws.send(JSON.stringify({
          "method": "subscribeTicker",
          "params": { symbol: pair },
          "id": 124,
        }));
      });
    };

    hbws.onmessage = onmsg => {
      const data = JSON.parse(onmsg.data);
      // console.log(data);

      if (data.method === 'updateTrades') {
        const { price, timestamp } = data.params.data[0];
        const { symbol } = data.params;
        log(
          market, 
          symbol, 
          parseFloat(price), 
          null,
          null,
          timeFromDate(timestamp)
        );
        render(market);
      }

      if (data.method === 'ticker') {
        const { ask, bid, symbol, timestamp } = data.params;
        log(
          market, 
          symbol, 
          null,
          parseFloat(ask), 
          parseFloat(bid),
          null
        );
        render(market);
      }

      // hbws.send(JSON.stringify({
      //   "method": "unsubscribeTicker",
      //   "params": {
      //     "symbol": "BCHETH"
      //   },
      //   "id": 123
      // }));
    };
  }

  if (markets.bitstamp.on) {
    const market = 'bitstamp',
          pusher = new Pusher('de504dc5763aeef9ff52');
    
    markets[market].pairs.forEach(pair => {
      const tradesChannel = pusher.subscribe(`live_trades_${pair}`);
      const orderBookChannel = pusher.subscribe(`order_book_${pair}`);

      tradesChannel.bind('trade', data => {
        // console.log(pair, data);
        log(
          market, 
          pair, 
          data.price, 
          null, 
          null, 
          timeFromUnix(data.timestamp)
        );
        render(market);

        // pusher.unsubscribe(`live_trades_${pair}`);
      });

      orderBookChannel.bind('data', data => {
        // console.log(pair, data);
        log(
          market, 
          pair, 
          null,
          parseFloat(data.asks[0][0]), 
          parseFloat(data.bids[0][0]), 
          null
        );
        render(market);

        // pusher.unsubscribe(`order_book_${pair}`);
      });
    });
  }

  function log(market, pair, price, ask, bid, time) {
    markets[market][pair] = price || markets[market][pair];
    markets[market][pair + '_bid'] = bid || markets[market][pair + '_bid'];
    markets[market][pair + '_ask'] = ask || markets[market][pair + '_ask'];
    markets[market][pair + '_time'] = time || markets[market][pair + '_time'];

    if (markets[market].conjPairs) {
      const { conjPairs } = markets[market];
      Object.keys(conjPairs).forEach(currencyPair => {
        const params = conjPairs[currencyPair];
        const conjPrice = params[2] === 'div' ?
          markets[market][params[0]] / markets[market][params[1]] :
          markets[market][params[0]] * markets[market][params[1]] ;
        markets[market][currencyPair] = conjPrice;
        markets[market][currencyPair + '_time'] = 
          time || markets[market][currencyPair + '_time'];
      });
    }
  }

  function render(market) {
    let text = '';
    function addToText(pair) {
      text += pairDisplayNames[pair] + 
      ': ' + markets[market][pair] + ', bid: ' + markets[market][pair + '_bid'] 
      + ', ask: ' + markets[market][pair + '_ask'] + ' at ' +
      markets[market][pair + '_time'] + '\n';
    }
    markets[market].pairs.forEach(pair => addToText(pair));
    if (markets[market].conjPairs)
      Object.keys(markets[market].conjPairs).forEach(pair => addToText(pair));
    const el = document.getElementById(market);
    el.textContent = text;
    el.style.whiteSpace = 'pre';

    calculateMargins();
  }

  function timeFromDate(dateStr) {
    // MMM Do YYYY
    return moment(dateStr).format('HH:mm:ss');
  }

  function timeFromUnix(timestamp) {
    return moment.unix(parseInt(timestamp)).format('HH:mm:ss');
  }

  function now() {
    return moment().format('HH:mm:ss');
  }
});