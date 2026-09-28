// Local development entry point. In production the same app runs as a Netlify
// function — see netlify/functions/api.js
require("dotenv").config();

const app = require("./app");
const connectDB = require("./db");

const PORT = process.env.PORT || 3000;

// Connect first, then listen — so the server never starts up in a state where
// it serves pages but cannot read or write any data.
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Startup failed — could not connect to MongoDB");
    console.error(err.message);
    process.exit(1);
  });
