import app from './firebaseConfig.js';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function getTodaysNews() {
    const db = getFirestore(app);

    const today = new Date().toISOString().split('T')[0];
    const newsCol = collection(db, 'news');
    const snapshot = await getDocs(newsCol);

    const news = [];
    snapshot.forEach(doc => {
        const data = doc.data();
        if (
            data.date &&
            data.date.split('T')[0] === today
        ) {
            news.push({ id: doc.id, ...data });
        }
    });
    return news; 
}

// Example usage:
// (async () => {
//     const todaysNews = await getTodaysNews();
//     console.log(JSON.stringify(todaysNews, null, 2));
// })();

export { getTodaysNews };