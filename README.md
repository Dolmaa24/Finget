# Finget: The Decision-First Financial System 💸🤖

Finget isn't just another expense tracker—it's a comprehensive, AI-native collaborative finance platform designed to shift the focus from *tracking what you spent* to *deciding what you can safely spend right now*.

## ✨ Novelties & Key Features

### 1. Decision-First "Safe-to-Spend" Algorithm
Traditional apps tell you what you spent last month. Finget calculates a **Safe Daily Allowance** in real-time. By dynamically subtracting mandatory obligations, savings goals, and current monthly spend from your income, Finget tells you exactly how much you can spend *today* without breaking your budget.

### 2. Context-Aware AI Money Coach (SSE Streaming)
Most financial bots give generic advice. Finget's AI Coach:
- Has a persistent conversational memory layer (`AIConversation` model).
- Streams responses chunk-by-chunk (using Server-Sent Events) for a native, ChatGPT-like typing experience.
- Is deeply context-aware. It receives real-time injections of your income, expenses, safe daily spend, and transaction history directly into its prompt.

### 3. Interactive Future Impact Simulator
A slider-based "What-If" engine. Before making a large purchase (like a new phone or dinner), enter the amount into the simulator. Finget immediately calculates how that specific purchase will:
- Deplete your remaining monthly budget.
- Delay your savings goals (e.g., "This delays your vacation goal by 14 days").
- Trigger dynamic risk warnings ("Warning: This exceeds your safe daily allowance").

### 4. "Friends Mode" Collaborative Context Engine
Finance isn't just personal; it's social. Finget introduces a robust explicit context architecture.
- Instead of implicitly switching states, the entire frontend and backend explicitly route data via `?context=user` or `?context=group&groupId=...`.
- Features a **Global Scope Toggle** to seamlessly switch the entire application dashboard from "Personal Mode" to shared "Friends Mode" wallets.
- Group-based Affordability: The engine aggregates the total income and obligations of all group members to calculate shared affordability.

### 5. Multi-Layer Insights Engine
The Insights Engine splits analysis into two pipelines:
1. **Deterministic Rule Engine**: High-speed, rule-based algorithms (like the *Subscription Leak Detector* which spots identical recurring charges) and the *Financial Health Score*.
2. **LLM Reasoning**: Passes complex, unstructured transaction data to OpenAI to generate deep, actionable anomalies that a simple script would miss.

## 🚀 Tech Stack

### Frontend
- **React + Vite** for lightning-fast module replacement.
- **Tailwind CSS** for ultra-minimalist, dark-themed, glassmorphic UI.
- **React Router DOM** for modular page architecture (`<MainLayout>`, `<BurgerSidebar>`).
- Custom Hooks (`useFingetBackend`, `useAiCoach`, `useGoals`, `useGroups`) handling explicit contexts and SSE streaming.

### Backend
- **Node.js + Express**
- **MongoDB + Mongoose** for flexible schema design (Users, Transactions, Goals, Groups, AIConversations).
- **OpenAI API** for the LLM Insights Engine and Money Coach.
- **JWT Authentication** and bcrypt password hashing.

## 🛠️ Implementation & Architecture

Our main challenge was extending an existing personal finance tracker into a multi-user, AI-native platform without breaking backward compatibility.

We solved this using an **Explicit Over Implicit** design philosophy.
Instead of relying on hidden global states that cause race conditions, we built a `ScopeContext` in React. The `<ScopeToggle />` component switches this state, and every downstream hook explicitly passes the context to the backend. The backend controllers (e.g., `transactionController`, `goalController`, `financeController`) dynamically branch their database queries and aggregation logic based on the explicit `req.query.context`.

## 🚦 Getting Started

1. Clone the repository
2. Install dependencies for both frontend and backend:
   ```bash
   npm install
   cd finget-backend && npm install
   ```
3. Create a `.env` file in the backend with:
   ```env
   MONGO_URI=your_mongodb_uri
   JWT_SECRET=your_secret
   OPENAI_API_KEY=your_openai_key
   PORT=5000
   ```
4. Run the development servers:
   ```bash
   # In root directory (Frontend)
   npm run dev

   # In finget-backend directory (Backend)
   npm run dev
   ```

Enjoy building wealth with Finget! 🚀
