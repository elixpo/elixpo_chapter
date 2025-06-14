// dev.js
import app from './api/index.js';

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running locally at http://localhost:${PORT}`);
});
