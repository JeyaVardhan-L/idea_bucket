# LLM extraction eval

Model: `nvidia/nemotron-3-ultra-550b-a55b` · Endpoint: `https://integrate.api.nvidia.com/v1` · Fixed date: 2026-11-25 (Wednesday) · Run: 2026-11-25T17:30:29.861Z

**Score: 15/15** (API calls this run: 15)

A case passes only when the item count is exact and every expected item has the right type, all listed concrete details, the expected match kind/id, person and due date.

| # | Case | Result | Time | Problems |
|---|------|--------|------|----------|
| 1 | multi-thought ramble | ✅ | 57.0s |  |
| 2 | name + relative deadline | ✅ | 8.2s |  |
| 3 | pure remember fact | ✅ | 8.1s |  |
| 4 | near-duplicate of existing call | ✅ | 7.0s |  |
| 5 | duplicate with added detail | ✅ | 24.3s |  |
| 6 | delegate with person | ✅ | 52.5s |  |
| 7 | learn topic | ✅ | 42.5s |  |
| 8 | related to existing | ✅ | 17.7s |  |
| 9 | two calls + numbers | ✅ | 14.8s |  |
| 10 | filler-heavy single task | ✅ | 9.8s |  |
| 11 | repeat of existing learn | ✅ | 28.1s |  |
| 12 | insight + reason | ✅ | 9.6s |  |
| 13 | mixed: duplicate + new | ✅ | 12.6s |  |
| 14 | end of month deadline + delegate follow-up | ✅ | 14.8s |  |
| 15 | noise only | ✅ | 2.8s |  |

## Raw outputs

### 1. multi-thought ramble ✅

> okay so um a few things. first I really need to renew my passport because it expires in March, uh, and then I should probably call the dentist, Dr. Mehta, to move my appointment. oh and also an idea, what if the coffee shop app showed live queue length

```json
[
 {
  "type": "task",
  "text": "Renew passport before it expires in March.",
  "person": null,
  "due_date": "2027-03-31",
  "excerpt": "first I really need to renew my passport because it expires in March, uh,",
  "match": {
   "kind": "new",
   "id": null
  }
 },
 {
  "type": "call",
  "text": "Call Dr. Mehta to reschedule dentist appointment.",
  "person": "Dr. Mehta",
  "due_date": null,
  "excerpt": "and then I should probably call the dentist, Dr. Mehta, to move my appointment.",
  "match": {
   "kind": "new",
   "id": null
  }
 },
 {
  "type": "idea",
  "text": "Add live queue length to coffee shop app.",
  "person": null,
  "due_date": null,
  "excerpt": "oh and also an idea, what if the coffee shop app showed live queue length",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 2. name + relative deadline ✅

> remind me to send the signed contract to Daniel Okafor by friday, he needs it for the board meeting

```json
[
 {
  "type": "task",
  "text": "Send the signed contract to Daniel Okafor by Friday for the board meeting",
  "person": "Daniel Okafor",
  "due_date": "2026-11-27",
  "excerpt": "remind me to send the signed contract to Daniel Okafor by friday, he needs it for the board meeting",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 3. pure remember fact ✅

> just so I don't forget, the wifi password at the cabin is bluefin 4 4 7 1, all lowercase

```json
[
 {
  "type": "remember",
  "text": "The wifi password at the cabin is bluefin 4 4 7 1, all lowercase.",
  "person": null,
  "due_date": null,
  "excerpt": "just so I don't forget, the wifi password at the cabin is bluefin 4 4 7 1, all lowercase",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 4. near-duplicate of existing call ✅

> uh I gotta ring mum about the lunch on sunday

Existing items offered: 6

```json
[
 {
  "type": "call",
  "text": "Call Mum about Sunday lunch plans",
  "person": "Mum",
  "due_date": "2026-11-29",
  "excerpt": "uh I gotta ring mum about the lunch on sunday",
  "match": {
   "kind": "duplicate",
   "id": "e1"
  }
 }
]
```

### 5. duplicate with added detail ✅

> the plant watering app idea again, it could use a cheap soil moisture sensor with an ESP32

Existing items offered: 6

```json
[
 {
  "type": "idea",
  "text": "Build an app that reminds me to water the plants using a cheap soil moisture sensor with an ESP32",
  "person": null,
  "due_date": null,
  "excerpt": "the plant watering app idea again, it could use a cheap soil moisture sensor with an ESP32",
  "match": {
   "kind": "duplicate",
   "id": "e2"
  }
 }
]
```

### 6. delegate with person ✅

> I should get Marco to handle the invoice reconciliation for the Lisbon office this week, I don't have time

```json
[
 {
  "type": "delegate",
  "text": "Delegate invoice reconciliation for Lisbon office to Marco this week.",
  "person": "Marco",
  "due_date": "2026-11-29",
  "excerpt": "I should get Marco to handle the invoice reconciliation for the Lisbon office this week, I don't have time",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 7. learn topic ✅

> hmm I keep seeing people talk about vector databases, I want to actually learn how pgvector indexing works, like HNSW versus IVF

Existing items offered: 6

```json
[
 {
  "type": "learn",
  "text": "Learn how pgvector indexing works, comparing HNSW versus IVF",
  "person": null,
  "due_date": null,
  "excerpt": "hmm I keep seeing people talk about vector databases, I want to actually learn how pgvector indexing works, like HNSW versus IVF",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 8. related to existing ✅

> for the tax thing I need to find last year's donation receipts first, they're probably in the blue folder

Existing items offered: 6

```json
[
 {
  "type": "task",
  "text": "Find last year's donation receipts in the blue folder for tax return",
  "person": null,
  "due_date": null,
  "excerpt": "for the tax thing I need to find last year's donation receipts first, they're probably in the blue folder",
  "match": {
   "kind": "related",
   "id": "e3"
  }
 }
]
```

### 9. two calls + numbers ✅

> call the bank about the 250 euro charge from the 14th that I don't recognise. and text Sam that I'll be 20 minutes late tomorrow

```json
[
 {
  "type": "call",
  "text": "Call the bank about the unrecognised 250 euro charge from 14 November.",
  "person": "the bank",
  "due_date": null,
  "excerpt": "call the bank about the 250 euro charge from the 14th that I don't recognise",
  "match": {
   "kind": "new",
   "id": null
  }
 },
 {
  "type": "call",
  "text": "Text Sam that I will be 20 minutes late tomorrow.",
  "person": "Sam",
  "due_date": "2026-11-26",
  "excerpt": "text Sam that I'll be 20 minutes late tomorrow",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 10. filler-heavy single task ✅

> so like, you know, I mean basically, the the thing is I need to uh book the car in for its MOT, um, before the 10th of December at the Halfords on Mill Road

```json
[
 {
  "type": "task",
  "text": "Book car in for MOT before 10th December at Halfords on Mill Road",
  "person": null,
  "due_date": "2026-12-10",
  "excerpt": "so like, you know, I mean basically, the the thing is I need to uh book the car in for its MOT, um, before the 10th of December at the Halfords on Mill Road",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 11. repeat of existing learn ✅

> I really need to get my head around the borrow checker in rust

Existing items offered: 6

```json
[
 {
  "type": "learn",
  "text": "Learn Rust borrow checker",
  "person": null,
  "due_date": null,
  "excerpt": "I really need to get my head around the borrow checker in rust",
  "match": {
   "kind": "duplicate",
   "id": "e4"
  }
 }
]
```

### 12. insight + reason ✅

> realisation: our churn spikes every time we change pricing without emailing customers first, so always announce price changes two weeks ahead

```json
[
 {
  "type": "remember",
  "text": "Churn spikes when pricing changes without emailing customers first; always announce price changes two weeks ahead.",
  "person": null,
  "due_date": null,
  "excerpt": "realisation: our churn spikes every time we change pricing without emailing customers first, so always announce price changes two weeks ahead",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 13. mixed: duplicate + new ✅

> that gate is still squeaking, need to fix the hinge, maybe WD-40. also new thing, order more printer ink, the HP 305 cartridges

Existing items offered: 6

```json
[
 {
  "type": "task",
  "text": "Fix the squeaky garden gate hinge, maybe use WD-40",
  "person": null,
  "due_date": null,
  "excerpt": "that gate is still squeaking, need to fix the hinge, maybe WD-40.",
  "match": {
   "kind": "duplicate",
   "id": "e5"
  }
 },
 {
  "type": "task",
  "text": "Order more printer ink, HP 305 cartridges",
  "person": null,
  "due_date": null,
  "excerpt": "order more printer ink, the HP 305 cartridges",
  "match": {
   "kind": "new",
   "id": null
  }
 }
]
```

### 14. end of month deadline + delegate follow-up ✅

> Priya's sales deck for Q4, I need it from her by the end of the month, remind her it has to include the APAC numbers

Existing items offered: 6

```json
[
 {
  "type": "delegate",
  "text": "Ask Priya to finish the Q4 sales deck by end of month including APAC numbers",
  "person": "Priya",
  "due_date": "2026-11-30",
  "excerpt": "Priya's sales deck for Q4, I need it from her by the end of the month, remind her it has to include the APAC numbers",
  "match": {
   "kind": "duplicate",
   "id": "e6"
  }
 }
]
```

### 15. noise only ✅

> test test one two

```json
[]
```
