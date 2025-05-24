import { projects, projectCategories } from "./Config/projectsList.js";
const projectSegmentDetectionDelay = 20;
let firstFocusSegmentProjects = 'Featured Section';
const showProjectDetails = (modeName) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            const projectContainer = document.getElementById("projectDisplaySection");
            if (!projectContainer) {
                console.error("Projects container element not found");
                resolve(); // Resolve even if container not found
                return;
            }

            let categoryKey = "";
            switch (modeName.trim()) {
                case "Featured Section":
                    categoryKey = "featured";
                    break;
                case "Vibe Coding":
                    categoryKey = "vibeCoding";
                    break;
                case "Creative Apps":
                    categoryKey = "creativeApps";
                    break;
                case "LLM Integrations":
                    categoryKey = "llmIntegrations";
                    break;
                case "Tools and Interfaces":
                    categoryKey = "toolsInterfaces";
                    break;
                case "Social Bots":
                    categoryKey = "socialBots";
                    break;
                case "SDK & Libraries":
                    categoryKey = "sdkLibraries";
                    break;
                case "Tutorials":
                    categoryKey = "tutorials";
                    break;
                default:
                    console.warn("Unknown category:", modeName);
                    resolve(); // Resolve on unknown category
                    return;
            }

            // Find the selected category configuration
            const selectedCategory = projectCategories.find(cat => cat.key === categoryKey);
            if (!selectedCategory) {
                console.error("Category not found in projectCategories config:", categoryKey);
                resolve(); // Resolve if category config not found
                return;
            }

            // Update the category title if you have an element for it
            const categoryTitleElement = document.getElementById("categoryTitle");
            if (categoryTitleElement) {
                categoryTitleElement.textContent = selectedCategory.title;
            } else {
                 console.warn("Element with id 'categoryTitle' not found.");
            }


            // Get projects for the selected category
            const categoryProjects = projects[categoryKey];

             // Animate out existing content before updating
             if (typeof anime !== 'undefined') {
                 anime({
                     targets: projectContainer,
                     opacity: [1, 0],
                     translateY: [0, -20],
                     duration: 300,
                     easing: 'easeOutQuad',
                     complete: () => {
                         // Clear existing content after fade out
                         projectContainer.innerHTML = '';

                          // Check if projects exist for the category
                         if (!categoryProjects || categoryProjects.length === 0) {
                             projectContainer.innerHTML = '<div class="no-projects">No projects found in this category</div>';
                         } else {
                              // Render each project
                             categoryProjects.forEach(project => {
                                 let projectNode = `
                                     <div class="projectTile">
                                         <div class="projectLogoContainer">
                                             <div class="projectLogo"></div> <!-- Placeholder for project logo -->
                                             <div class="projectNameRedirect" ${project.url ? `data-url="${project.url}"` : ""} ${project.url ? 'style="cursor: pointer;"' : ''}>
                                             ${project.name}
                                             </div>
                                         </div>

                                         ${project.author ? `<div class="projectCreator">- by ${project.author}</div>` : ""}

                                         <div class="projectDescription">
                                             ${project.description}
                                         </div>

                                         ${project.repo ? `
                                         <div class="projectURLGithub" data-url="${project.repo}" style="cursor: pointer;">
                                             <ion-icon name="logo-github" role="img" class="md hydrated"></ion-icon>
                                             Source
                                         </div>
                                         ` : ""}

                                         ${project.isNew ? `<span class="new-badge">NEW</span>` : ""}
                                         ${project.stars ? `<span class="stars-badge">⭐ ${project.stars}</span>` : ""}
                                     </div>
                                     `;
                                      // Using insertAdjacentHTML is slightly more performant than +=
                                     projectContainer.insertAdjacentHTML('beforeend', projectNode);
                             });

                              // Add click listeners for project tiles and links *after* they are added to the DOM
                              projectContainer.querySelectorAll('.projectNameRedirect').forEach(el => {
                                  const url = el.dataset.url;
                                  if (url) {
                                      el.addEventListener('click', () => window.open(url, '_blank'));
                                  }
                              });
                              projectContainer.querySelectorAll('.projectURLGithub').forEach(el => {
                                   const url = el.dataset.url;
                                   if (url) {
                                       el.addEventListener('click', () => window.open(url, '_blank'));
                                   }
                               });
                         }


                         // Animate in new content
                         anime({
                             targets: projectContainer,
                             opacity: [0, 1],
                             translateY: [20, 0],
                             scale: [0.98, 1], // Slightly less intense scale animation
                             duration: 400, // Shorter duration
                             easing: 'easeOutQuad'
                         });

                         resolve(); // Resolve promise after animations and rendering
                     }
                 });
             } else {
                 console.warn("Anime.js not loaded, project content animation skipped.");
                  // Clear existing content
                 projectContainer.innerHTML = '';

                  // Check if projects exist for the category
                 if (!categoryProjects || categoryProjects.length === 0) {
                     projectContainer.innerHTML = '<div class="no-projects">No projects found in this category</div>';
                 } else {
                      // Render each project
                     categoryProjects.forEach(project => {
                         let projectNode = `
                             <div class="projectTile">
                                 <div class="projectLogoContainer">
                                     <div class="projectLogo"></div> <!-- Placeholder for project logo -->
                                     <div class="projectNameRedirect" ${project.url ? `data-url="${project.url}"` : ""} ${project.url ? 'style="cursor: pointer;"' : ''}>
                                     ${project.name}
                                     </div>
                                 </div>

                                 ${project.author ? `<div class="projectCreator">- by ${project.author}</div>` : ""}

                                 <div class="projectDescription">
                                     ${project.description}
                                 </div>

                                  ${project.repo ? `
                                  <div class="projectURLGithub" data-url="${project.repo}" style="cursor: pointer;">
                                      <ion-icon name="logo-github" role="img" class="md hydrated"></ion-icon>
                                      Source
                                  </div>
                                  ` : ""}

                                 ${project.isNew ? `<span class="new-badge">NEW</span>` : ""}
                                 ${project.stars ? `<span class="stars-badge">⭐ ${project.stars}</span>` : ""}
                             </div>
                             `;
                              projectContainer.insertAdjacentHTML('beforeend', projectNode);
                     });

                      // Add click listeners for project tiles and links *after* they are added to the DOM
                      projectContainer.querySelectorAll('.projectNameRedirect').forEach(el => {
                          const url = el.dataset.url;
                          if (url) {
                              el.addEventListener('click', () => window.open(url, '_blank'));
                          }
                      });
                      projectContainer.querySelectorAll('.projectURLGithub').forEach(el => {
                           const url = el.dataset.url;
                           if (url) {
                               el.addEventListener('click', () => window.open(url, '_blank'));
                           }
                       });
                 }
                 projectContainer.style.opacity = 1; // Ensure visibility without animation
                 projectContainer.style.transform = 'none';
                 resolve(); // Resolve promise immediately if no animation
             }


        }, projectSegmentDetectionDelay); // Use project-specific delay
    });
};


document.addEventListener('DOMContentLoaded', () => {
    const segmentList = document.querySelector('.segment-list-projects');
    // Ensure segmentList exists before proceeding
    if (!segmentList) {
        console.error("Element with class 'segment-list-projects' not found.");
        return;
    }

    let dragEndedRecently = false;
    let showDetailsTimeout;
    const segmentContent = [
        'Vibe Coding',
        'Creative Apps',
        'LLM Integrations',
        'Featured Section',
        'Tools and Interfaces',
        'Social Bots',
        'SDK & Libraries',
        'Tutorials',
    ];

    let scrollTimeout;
    const scrollStopDelay = 200; // Delay for snapping after scroll stops
    let isDragging = false; // Flag to indicate if a custom drag is in progress
    let startY; // Starting Y coordinate for drag (mouse or touch)
    let startScrollTop; // Starting scrollTop for drag
    let animation = null; // Anime.js animation instance
    let itemFullHeight = 0; // Height of a segment item + margin
    const dragSensitivityFactor = 0.889; // Factor to reduce drag sensitivity


     // Debounce function (already good)
     function debounce(func, delay) {
        let timer;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timer);
            timer = setTimeout(() => {
                func.apply(context, args);
            }, delay);
        };
     }

    // Get the index of the element closest to the center (already good)
    function getClosestElementIndexToCenter() {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (segments.length === 0) return -1;

        let closestIndex = -1;
        let minDistance = Infinity;
        const containerCenter = segmentList.scrollTop + segmentList.clientHeight / 2;

        segments.forEach((segment, index) => {
             const segmentCenter = segment.offsetTop + segment.offsetHeight / 2;
             const distanceRelativeToCenter = Math.abs(segmentCenter - containerCenter);
            if (distanceRelativeToCenter < minDistance) {
                minDistance = distanceRelativeToCenter;
                closestIndex = index;
            }
        });
        return closestIndex;
    }

     // Helper function to get the element closest to center
     function getClosestElementElementToCenter() {
         const segments = segmentList.querySelectorAll('.segment-item-project');
         if (segments.length === 0) return null;

         let closestElement = null;
         let minDistance = Infinity;
         const containerCenter = segmentList.scrollTop + segmentList.clientHeight / 2;

         segments.forEach((segment) => {
              const segmentCenter = segment.offsetTop + segment.offsetHeight / 2;
              const distanceRelativeToCenter = Math.abs(segmentCenter - containerCenter);
             if (distanceRelativeToCenter < minDistance) {
                 minDistance = distanceRelativeToCenter;
                 closestElement = segment;
             }
         });
         return closestElement;
     }


    // Calculate the scrollTop needed to center an element at a given index (already good)
    function getScrollTopToCenterElementIndex(index) {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (index < 0 || index >= segments.length) return segmentList.scrollTop;

        const targetElement = segments[index];
        const targetScrollTop = targetElement.offsetTop - (segmentList.clientHeight / 2) + (targetElement.offsetHeight / 2);

        // Clamp the targetScrollTop to prevent over-scrolling
         const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
         return Math.max(0, Math.min(maxScrollTop, targetScrollTop));
    }

    // Update visual styles based on proximity to center (already good)
    function updateStyles() {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (segments.length === 0) return;

        const closestIndex = getClosestElementIndexToCenter();
        segments.forEach((segment, index) => {
            segment.classList.remove('selected', 'faint', 'most-fainted');

            if (index === closestIndex) {
                segment.classList.add('selected');
            } else if (Math.abs(index - closestIndex) === 1) {
                segment.classList.add('faint');
            } else if (Math.abs(index - closestIndex) >= 2) { // Apply 'most-fainted' to items 2 or more away
                segment.classList.add('most-fainted');
            }
         });
    }

     // Set padding to center the list content vertically (already good)
     function setDynamicPadding() {
         const firstItem = segmentList.querySelector('.segment-item-project');
         if (!firstItem) {
              console.warn("No segment items found to calculate padding.");
              return;
         }

         // Only calculate itemFullHeight once if possible
         if (itemFullHeight === 0) {
            const itemStyle = getComputedStyle(firstItem);
            itemFullHeight = firstItem.offsetHeight + parseFloat(itemStyle.marginTop) + parseFloat(itemStyle.marginBottom);
         }


         const containerHeight = segmentList.clientHeight;
         const requiredPadding = (containerHeight / 2) - (itemFullHeight / 2);
         const paddingTopBottom = Math.max(0, requiredPadding); // Ensure padding is not negative
         segmentList.style.paddingTop = `${paddingTopBottom}px`;
         segmentList.style.paddingBottom = `${paddingTopBottom}px`;

         // Update styles after padding changes, as it might affect centering
         updateStyles();
     }

    // Smoothly scroll to a segment by index using Anime.js
    function scrollToSegment(index, duration, easing) {
        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (index < 0 || index >= segments.length) return;

        const clampedScrollTop = getScrollTopToCenterElementIndex(index); // Use the clamped value

        // Only animate if the target is significantly different from the current position
        if (Math.abs(segmentList.scrollTop - clampedScrollTop) > 1) {
             // Stop any existing animation
             if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
                  animation.pause();
             }
            // Use requestAnimationFrame to ensure animation target is correct after potential layout shifts
             requestAnimationFrame(() => {
                 if (typeof anime === 'undefined') {
                      console.warn("Anime.js not loaded, smooth scroll skipped.");
                      segmentList.scrollTop = clampedScrollTop;
                      updateStyles();
                      const centeredIndex = getClosestElementIndexToCenter();
                       if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                         delayedShowProjectDetails(segmentContent[centeredIndex]);
                       }
                      return;
                 }
                 animation = anime({
                     targets: segmentList,
                     scrollTop: clampedScrollTop,
                     easing: easing,
                     duration: duration,
                     autoplay: true,
                     complete: () => {
                          updateStyles();
                          animation = null; // Clear animation reference

                          // Clear any pending showDetails timeout if a new scroll completes
                          clearTimeout(showDetailsTimeout);
                          const centeredIndex = getClosestElementIndexToCenter();
                           if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                             // Pass the actual text content
                             delayedShowProjectDetails(segmentContent[centeredIndex]);
                           }
                     }
                 });
             });
        } else {
             // If already close, just update styles and trigger details without animation
             updateStyles();
             clearTimeout(showDetailsTimeout);
              const centeredIndex = getClosestElementIndexToCenter();
               if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
                    delayedShowProjectDetails(segmentContent[centeredIndex]);
               }
        }
    }

    // Delay the call to showProjectDetails
    function delayedShowProjectDetails(modeName) {
        clearTimeout(showDetailsTimeout);

        showDetailsTimeout = setTimeout(() => {
             // Check if the currently centered item is *still* the one we intended
             // before triggering the expensive showProjectDetails operation.
            const currentlyCenteredElement = getClosestElementElementToCenter();
             const currentlyCenteredIndex = currentlyCenteredElement ? parseInt(currentlyCenteredElement.dataset.index, 10) : -1;
             const intendedMode = modeName.trim();
             const currentlyCenteredMode = currentlyCenteredIndex !== -1 && currentlyCenteredIndex < segmentContent.length ? segmentContent[currentlyCenteredIndex]?.trim() : null;


            if (currentlyCenteredMode === intendedMode) {
                 // Make sure showProjectDetails function exists (defined outside DOMContentLoaded)
                 if (typeof showProjectDetails === 'function') {
                     showProjectDetails(modeName);
                 } else {
                     console.log("showProjectDetails function not available. Placeholder called with:", modeName);
                     // Optionally call a placeholder or just log
                 }
            } else {
                // This can happen if the user scrolls again before the timeout fires
                // console.log(`Delayed details for "${intendedMode}" cancelled. "${currentlyCenteredMode || 'Nothing'}" is now centered.`);
            }

        }, projectSegmentDetectionDelay); // Use project-specific delay
    }


    // Function called when scroll stops (mouse wheel, touch flick, drag release)
    const handleScrollStop = () => {
        // Only snap if we are not currently dragging or animating
        if (!isDragging && (animation === null || (typeof animation.state !== 'undefined' && animation.state !== 'stopped'))) { // Check for anime.js state existence
            const closestIndex = getClosestElementIndexToCenter();
            if (closestIndex !== -1 && closestIndex < segmentContent.length) {
                 scrollToSegment(closestIndex, 800, 'easeOutElastic(1, .2)');
            }
        }
    };

    // Handle scroll events while the list is being scrolled natively (flicking, mouse wheel)
     const handleScrollOnScroll = () => {
         updateStyles(); // Update styles while scrolling
         // Clear the previous scroll stop timeout and set a new one
         clearTimeout(scrollTimeout);
         // Only set the timeout if not dragging or animating
          if (!isDragging && (animation === null || (typeof animation.state !== 'undefined' && animation.state !== 'stopped'))) { // Check for anime.js state existence
            scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         }
         // Also clear the show details timeout while scrolling, it will be set by handleScrollStop -> scrollToSegment -> delayedShowProjectDetails
         clearTimeout(showDetailsTimeout);
    };


    // Populate the list with segment items (already good)
    function populateSegments() {
        segmentList.innerHTML = '';
        segmentContent.forEach((content, index) => {
            const segmentItem = document.createElement('div');
            segmentItem.classList.add('segment-item-project'); // Use project specific class
            segmentItem.textContent = content;
            segmentItem.dataset.index = index; // Store index as data attribute
            segmentList.appendChild(segmentItem);
        });
         // Calculate padding after populating
        setDynamicPadding();
    }


    // --- Mouse Events ---
    segmentList.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left mouse button

        isDragging = true;
        startY = e.clientY;
        startScrollTop = segmentList.scrollTop;
        segmentList.style.cursor = 'grabbing';
        // Stop any ongoing animation immediately on drag start
        if (animation && typeof animation.pause === 'function' && typeof animation.state !== 'undefined' && animation.state !== 'stopped') { // Check for anime.js state existence
            animation.pause();
            animation = null;
        }
        // Clear timeouts on drag start
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);
         // Prevent default only if needed to stop potential native drag, but letting text select is often better
         // e.preventDefault(); // Consider if you need this - might prevent selecting text
    });

     document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault(); // Prevent default scrolling behavior when dragging

        const deltaY = e.clientY - startY;
        const newScrollTop = startScrollTop - (deltaY * dragSensitivityFactor); // Apply sensitivity factor
        segmentList.scrollTop = newScrollTop;
        updateStyles(); // Update styles while dragging
     });

     document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        segmentList.style.cursor = 'grab'; // Restore cursor

        // Set flag to prevent immediate click handler after drag
        dragEndedRecently = true;
        // Reset the flag after a short delay
        setTimeout(() => {
            dragEndedRecently = false;
        }, 300); // Short delay is sufficient

        // Handle potential snap and details display after drag ends
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         // Don't clear showDetailsTimeout here, handleScrollStop will manage it via scrollToSegment
    });

    // --- Touch Events ---
    segmentList.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return; // Only handle single touch

        isDragging = true;
        startY = e.touches[0].clientY;
        startScrollTop = segmentList.scrollTop;
        // Stopping animation and clearing timeouts is important for touch drag too
         if (animation && typeof animation.pause === 'function' && typeof animation.state !== 'undefined' && animation.state !== 'stopped') { // Check for anime.js state existence
            animation.pause();
            animation = null;
        }
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);
         // No need to prevent default here initially, let touchmove decide
    }, { passive: true }); // Use passive: true for touchstart for better performance

     segmentList.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;
        e.preventDefault(); // Prevent native touch scrolling when custom dragging

        const deltaY = e.touches[0].clientY - startY;
        const newScrollTop = startScrollTop - (deltaY * dragSensitivityFactor);
        segmentList.scrollTop = newScrollTop;
        updateStyles();
     }, { passive: false }); // passive: false is needed to allow preventDefault()

     const handleTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        // No cursor to reset for touch

        dragEndedRecently = true;
        setTimeout(() => {
            dragEndedRecently = false;
        }, 300); // Short delay

        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
         // Don't clear showDetailsTimeout here, handleScrollStop will manage it
     };

     segmentList.addEventListener('touchend', handleTouchEnd);
     segmentList.addEventListener('touchcancel', handleTouchEnd); // Handle touch interruptions


    // --- Wheel Event (primarily for mouse/trackpad) ---
    // This handler forces stepping item by item rather than smooth native scroll.
    segmentList.addEventListener('wheel', (e) => {
        e.preventDefault(); // Prevent default mouse wheel scroll

        // Only respond if not dragging or animating
        if (isDragging || (animation && typeof animation.state !== 'undefined' && animation.state !== 'stopped')) { // Check for anime.js state existence
             return;
        }

        const segments = segmentList.querySelectorAll('.segment-item-project');
        if (segments.length === 0) return;

        const closestIndex = getClosestElementIndexToCenter();
        if (closestIndex === -1) return;

        let targetIndex = closestIndex;
        const direction = e.deltaY > 0 ? 1 : -1; // Determine scroll direction
        targetIndex += direction; // Move to the next/previous index
        targetIndex = Math.max(0, Math.min(segments.length - 1, targetIndex)); // Clamp index

        // Scroll to the calculated target index
        scrollToSegment(targetIndex, 500, 'easeInOutQuad'); // Use a different easing/duration for step scrolling

        // Clearing these timeouts prevents handleScrollOnScroll/handleScrollStop from interfering
        // while the wheel-initiated animation is running.
        clearTimeout(scrollTimeout);
        clearTimeout(showDetailsTimeout);


    }, { passive: false }); // passive: false is needed to call preventDefault()


    // --- Global Scroll Listener (Handles native scrolling from flicking/wheel if not handled by custom wheel handler) ---
    // Attach this listener ONCE during initialization. Its logic prevents
    // interfering with custom drags or animations.
    // Remove the conditional check using dataset - just add it directly.
    segmentList.addEventListener('scroll', handleScrollOnScroll);


    // --- Click Listener (Handles taps) ---
    // Needs to be after mouseup/touchend handlers which set dragEndedRecently
    segmentList.addEventListener('click', (e) => {
        // If a drag just ended, ignore the click event
        if (dragEndedRecently) {
            e.stopPropagation();
            // console.log("Click ignored due to recent drag");
            return;
        }

        const clickedSegment = e.target.closest('.segment-item-project'); // Use project specific class
        // Only proceed if a segment item was clicked
        if (!clickedSegment) {
            // console.log("Click not on a segment item");
            return;
        }

        // Get the index from the data attribute
        const clickedIndex = parseInt(clickedSegment.dataset.index, 10);

        // Ensure the index is valid
        if (!isNaN(clickedIndex) && clickedIndex !== -1 && clickedIndex < segmentContent.length) {
            // Scroll to the clicked segment
            scrollToSegment(clickedIndex, 500, 'easeInOutQuad');

            // Clear any pending scroll stop or details display timers
            clearTimeout(scrollTimeout);
            clearTimeout(showDetailsTimeout);

            // Note: The delayedShowProjectDetails call is handled within scrollToSegment's complete callback
            // or immediately if no scroll is needed.
        }
    });

    // --- Initialization ---
    // Populate the list items
    populateSegments();

    // Use requestAnimationFrame to ensure layout is ready before initial positioning
    requestAnimationFrame(() => {
         // Set initial padding based on calculated item height and container size
         setDynamicPadding();

        const initialContentText = firstFocusSegmentProjects;
        const segments = segmentList.querySelectorAll('.segment-item-project'); // Use project specific class

        let initialSelectedIndex = -1;

        // Find the index of the segment matching firstFocusSegmentProjects
        segments.forEach((segment, index) => {
             if (segment.textContent === initialContentText) {
                 initialSelectedIndex = index;
             }
        });

        // If the initial text was found, scroll to it, otherwise scroll to the middle element
        let indexToCenterInitially = initialSelectedIndex !== -1 ? initialSelectedIndex : (segments.length > 0 ? Math.floor(segments.length / 2) : -1);

        if (indexToCenterInitially !== -1 && indexToCenterInitially < segmentContent.length) {
             const targetScrollTop = getScrollTopToCenterElementIndex(indexToCenterInitially);
             segmentList.scrollTop = targetScrollTop;
        }

        // Update styles and show details for the initially centered item
        updateStyles();
         const centeredIndex = getClosestElementIndexToCenter();
         if (centeredIndex !== -1 && centeredIndex < segmentContent.length) {
             // Pass the actual text content
            delayedShowProjectDetails(segmentContent[centeredIndex]);
         }

    });

     window.addEventListener('resize', debounce(() => {
         setDynamicPadding(); 
         clearTimeout(scrollTimeout);
         scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
     }, 100));

}); 