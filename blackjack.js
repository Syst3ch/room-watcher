// blackjack.js -- a minimal terminal BlackJack game.

const readline = require('readline/promises');

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const { rank } of hand) {
    if (rank === 'A') {
      total += 11;
      aces++;
    } else if (['J', 'Q', 'K'].includes(rank)) {
      total += 10;
    } else {
      total += Number(rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

const show = (hand) => hand.map((c) => `${c.rank}${c.suit}`).join(' ');

async function playRound(rl) {
  const deck = newDeck();
  const player = [deck.pop(), deck.pop()];
  const dealer = [deck.pop(), deck.pop()];

  console.log(`\nDealer: ${show([dealer[0]])} ??`);

  while (handValue(player) < 21) {
    console.log(`You:    ${show(player)}  (${handValue(player)})`);
    const answer = (await rl.question('[h]it or [s]tand? ')).trim().toLowerCase();
    if (answer === 'h') player.push(deck.pop());
    else if (answer === 's') break;
  }

  const playerTotal = handValue(player);
  console.log(`You:    ${show(player)}  (${playerTotal})`);
  if (playerTotal > 21) return console.log('Bust! Dealer wins.');

  while (handValue(dealer) < 17) dealer.push(deck.pop());
  const dealerTotal = handValue(dealer);
  console.log(`Dealer: ${show(dealer)}  (${dealerTotal})`);

  if (dealerTotal > 21 || playerTotal > dealerTotal) console.log('You win!');
  else if (playerTotal < dealerTotal) console.log('Dealer wins.');
  else console.log('Push.');
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  do {
    await playRound(rl);
  } while ((await rl.question('\nPlay again? [y/n] ')).trim().toLowerCase() === 'y');
  rl.close();
}

main();
