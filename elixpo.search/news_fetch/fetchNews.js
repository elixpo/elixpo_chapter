// search/news_fetch/fetchNews.js
const axios = require('axios')
const fs = require('fs')
require('dotenv').config()

const API_KEY = process.env.NEWS_API_KEY // from your .env file
const NEWS_API_URL = 'https://newsapi.org/v2/top-headlines'
const today = new Date().toISOString().split('T')[0]
const outputFolder = './search/news_fetch/news'
const fileName = `${today}_news.json`

async function fetchNews() {
  try {
    console.log('📡 Fetching latest world news...')

    const response = await axios.get(NEWS_API_URL, {
      params: {
        category: 'general', // general news (world category)
        language: 'en', // English news
        pageSize: 20, // number of articles
        apiKey: API_KEY,
      },
    })

    const news = response.data.articles.map((a) => ({
      title: a.title,
      url: a.url,
      date: a.publishedAt,
    }))

    fs.mkdirSync(outputFolder, { recursive: true })
    fs.writeFileSync(
      `${outputFolder}/${fileName}`,
      JSON.stringify(news, null, 2)
    )

    console.log(`✅ Latest world news saved at ${outputFolder}/${fileName}`)
  } catch (error) {
    console.error(
      '❌ Error fetching news:',
      error.response?.data || error.message
    )
  }
}

fetchNews()
