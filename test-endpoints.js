const http = require('http');

async function testBackend() {
  console.log("Registering user...");
  let res = await fetch("http://localhost:5001/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test User", email: "test@example.com", password: "password123", monthlyIncome: 50000 })
  });
  let data = await res.json();
  if (res.status === 400 && data.msg === 'User already exists') {
     console.log("User already exists, logging in instead...");
     res = await fetch("http://localhost:5001/api/auth/login", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({ email: "test@example.com", password: "password123" })
     });
     data = await res.json();
  }
  const token = data.token;
  console.log("Token:", token.slice(0, 20) + "...");

  console.log("Testing AI Roast...");
  res = await fetch("http://localhost:5001/api/ai/roast", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ amount: 141900, itemOrCategory: "Amazon Product", context: "user" })
  });
  data = await res.json();
  console.log("Roast Response:", res.status, data);

  console.log("Testing Add to Wishlist...");
  res = await fetch("http://localhost:5001/api/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
    body: JSON.stringify({ targetAmount: 141900, name: "🎁 Wishlist: Amazon Product", priority: "Medium", context: "user" })
  });
  data = await res.json();
  console.log("Wishlist Response:", res.status, data);
}

testBackend().catch(console.error);
