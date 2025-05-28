import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { promisify } from 'util';

const getLength = promisify(FormData.prototype.getLength);

async function uploadToUguu(filePath) {
  const form = new FormData();
  // Use 'files[]' key because Uguu expects an array of files
  form.append('files[]', fs.createReadStream(filePath));

  try {
    const length = await getLength.call(form);

    const response = await axios.post('https://uguu.se/upload.php', form, {
      headers: {
        ...form.getHeaders(),
        'Content-Length': length,
      },
      maxBodyLength: Infinity,
    });

    const link = response.data.files?.[0]?.url || response.data;
    console.log('✅ Temporary image URL:', link);
    return link;
  } catch (err) {
    console.error('❌ Upload failed:', err.response?.data || err.message);
  }
}

// Usage example:
uploadToUguu('./input.jpg');
