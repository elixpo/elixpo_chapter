let imageCount = 0
let imagesData = []
const VISIBLE_IMAGE_COUNT = 50
let isLoading = false
const LOAD_THRESHOLD = 450
let msnry = null
let imageQueue = []
const PARALLEL_IMAGE_LOADS = 5 
const IMAGES_PER_BATCH = 50
const eventSource = new EventSource('https://image.pollinations.ai/feed')

function initMasonry () {
  const feedWrapper = document.getElementById('feedImageWrapper')

  if (feedWrapper && typeof Masonry !== 'undefined') {
    msnry = new Masonry(feedWrapper, {
      itemSelector: '.feedContent',
      columnWidth: '.feedContent',
      percentPosition: true,
      gutter: 12,
      transitionDuration: '0.3s',
      stagger: 30,
      initLayout: true
    })
    console.log('Masonry initialized')
  } else if (feedWrapper && typeof Masonry === 'undefined') {
    console.error(
      'Masonry.js not loaded! Check if masonry.pkgd.min.js is included.'
    )
  }
}

// Debounce Masonry layout calls
let layoutTimer = null
function debounceLayout () {
  if (msnry) {
    clearTimeout(layoutTimer)
    layoutTimer = setTimeout(() => {
      msnry.layout()
    }, 100)
  }
}

function processImageQueue () {
  if (imageQueue.length === 0) return

  // Load up to PARALLEL_IMAGE_LOADS images at once
  const batch = imageQueue.splice(0, PARALLEL_IMAGE_LOADS)
  let completed = 0

  batch.forEach(imageData => {
    renderSingleImage(imageData, () => {
      completed++
      if (completed === batch.length) {
        // When all in batch are done, process next batch
        if (imageQueue.length > 0) {
          processImageQueue()
        }
      }
    })
  })
}

function renderSingleImage (imageData, callback) {
  const feedImageWrapper = document.getElementById('feedImageWrapper')

  if (document.querySelector(`[data-id="${imageData.id}"]`)) {
    callback()
    return
  }

  let node = document.createElement('div')
  node.className = 'feedContent'
  node.setAttribute('data-id', imageData.id)

  node.style.visibility = 'hidden'
  node.style.opacity = '0'

  node.innerHTML = `
    <img src="${imageData.imageURL}" />
    <div class="prompt">${imageData.prompt}</div>
  `

  const tempImg = new Image()

  tempImg.onload = function () {
    feedImageWrapper.appendChild(node)

    const image = node.querySelector('img')
    const prompt = node.querySelector('.prompt')

    if (msnry) {
      msnry.appended(node)
      debounceLayout()
    }

    node.style.visibility = 'visible'

    gsap.to(node, {
      opacity: 1,
      duration: 0.5,
      ease: 'power2.out'
    })

    gsap.from(image, {
      scale: 0.95,
      filter: 'blur(8px)',
      duration: 0.6,
      ease: 'power3.out',
      onUpdate: function () {
        image.style.filter = `blur(${8 * (1 - this.progress())}px)`
      },
      onComplete: function () {
        image.style.filter = 'none'
      }
    })

    gsap.from(prompt, {
      y: 10,
      opacity: 0,
      duration: 0.4,
      delay: 0.2,
      ease: 'power2.out'
    })

    callback()
  }

  tempImg.onerror = function () {
    console.error('Image failed to load:', imageData.imageURL)
    callback()
  }

  tempImg.src = imageData.imageURL
}

function appendImage (imageData) {
  if (!imageData.id) {
    imageData.id = `${Date.now()}-${Math.random()}`
  }

  imagesData.push(imageData)
  imageQueue.push(imageData)

  // Start processing if not already running
  if (imageQueue.length <= PARALLEL_IMAGE_LOADS) {
    processImageQueue()
  }
}

function startListening () {
  if (isLoading) return
  isLoading = true

  if (!msnry) {
    initMasonry()
  }

  eventSource.onmessage = function (event) {
    const imageData = JSON.parse(event.data)

    if (
      imageData.imageURL == undefined ||
      imageData.nsfw == true ||
      imageData.imageURL == '' ||
      imageData.imageURL == null
    ) {
      return
    }

    appendImage(imageData)
    imageCount++

    if (imageCount >= IMAGES_PER_BATCH) {
      eventSource.close()
      isLoading = false
      imageCount = 0
      // Auto-restart EventSource for continuous loading
      setTimeout(startListening, 100)
    }
  }

  eventSource.onerror = function () {
    eventSource.close()
    isLoading = false
  }
}

function isNearBottom () {
  const feedImageWrapper = document.getElementById('feedImageWrapper')
  return (
    feedImageWrapper.scrollTop + feedImageWrapper.clientHeight >=
    feedImageWrapper.scrollHeight - LOAD_THRESHOLD
  )
}

document
  .getElementById('feedImageWrapper')
  .addEventListener('wheel', function () {
    if (isNearBottom() && !isLoading) {
      console.log('Loading more images...')
      startListening()
    }
  })

let resizeTimer
window.addEventListener('resize', function () {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    if (msnry) {
      msnry.layout()
    }
  }, 250)
})

startListening()

document.getElementById('homePage').addEventListener('click', function () {
  redirectTo('')
})

document.getElementById('visitGallery').addEventListener('click', function () {
  redirectTo('src/gallery')
})

document.getElementById('createArt').addEventListener('click', function () {
  redirectTo('src/create')
})

document.getElementById('closeStream').addEventListener('click', function () {
  redirectTo('integrations')
})