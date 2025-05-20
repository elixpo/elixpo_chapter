document.addEventListener('DOMContentLoaded', () => {
    const segmentList = document.querySelector('.segment-list');
    let dragEndedRecently = false;
    let showDetailsTimeout;
    
        // Define the finite list of segment content
        const segmentContent = [
            'Segment 1',
            'Segment 2',
            'Segment 3 (Selected)', // Indicate which one should be initially centered
            'Segment 4',
            'Segment 5',
            'Segment 6',
            'Segment 7',
            'Segment 8',
            'Segment 9',
            'Segment 10',
            'Segment 11',
            'Segment 12',
        ];
    
        // Configuration for snapping and drag
        let scrollTimeout; // Timer for detecting scroll stop from native-like scrolling (drag)
        const scrollStopDelay = 100; // Milliseconds after last scroll event to trigger snap
        let isDragging = false;
        let startY;
        let startScrollTop;
        let animation = null; // Store anime.js animation instance
        let itemFullHeight = 0; // Will be calculated after elements are added
        const wheelSensitivityMultiplier = 0.5; // Adjust wheel scroll speed
    
        // Helper function for debouncing
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
    
        // --- Core Utility Functions ---
    
        // Function to get the index of the element closest to the center
        function getClosestElementIndexToCenter() {
            const segments = segmentList.querySelectorAll('.segment-item');
            if (segments.length === 0) return -1;
    
            let closestIndex = -1;
            let minDistance = Infinity;
    
            segments.forEach((segment, index) => {
                 const segmentCenter = segment.offsetTop + segment.offsetHeight / 2;
                 // Calculate distance relative to the center of the scrollable container's visible area
                 const distanceRelativeToCenter = Math.abs(segmentCenter - (segmentList.scrollTop + segmentList.clientHeight / 2));
    
                if (distanceRelativeToCenter < minDistance) {
                    minDistance = distanceRelativeToCenter;
                    closestIndex = index;
                }
            });
            return closestIndex;
        }
    
        // Function to calculate the target scroll position to center an element by its index
        // Needs getClosestElementIndexToCenter only if calculating from closest, but this version
        // calculates target scroll for a *given* index.
         function getScrollTopToCenterElementIndex(index) {
            const segments = segmentList.querySelectorAll('.segment-item');
            if (index < 0 || index >= segments.length) return segmentList.scrollTop;
    
            const targetElement = segments[index];
            // Calculate scroll position to bring the element's center to the container's center
            return targetElement.offsetTop - (segmentList.clientHeight / 2) + (targetElement.offsetHeight / 2);
        }
    
    
        // --- UI State Update Functions ---
    
        // Function to update styles based on proximity to center
        // Needs getClosestElementIndexToCenter
        function updateStyles() {
            const segments = segmentList.querySelectorAll('.segment-item');
            if (segments.length === 0) return;
    
            // Find the segment closest to the center
            const closestIndex = getClosestElementIndexToCenter();
    
            segments.forEach((segment, index) => {
                 // Remove all previous state classes
                segment.classList.remove('selected', 'faint', 'most-fainted');
    
                // Apply classes based on proximity to the selected item by list index
                if (index === closestIndex) {
                    segment.classList.add('selected');
                } else if (Math.abs(index - closestIndex) === 1) {
                    segment.classList.add('faint');
                } else if (Math.abs(index - closestIndex) === 2) {
                    segment.classList.add('most-fainted');
                }
                // Styles for further items are handled by the default .segment-item opacity/transform
             });
        }
    
    
        // Function to set dynamic padding to allow centering first/last items
        // Needs itemFullHeight and updateStyles
         function setDynamicPadding() {
             // Calculate item height if not already done
             if (itemFullHeight === 0) {
                  const firstItem = segmentList.querySelector('.segment-item');
                  if (firstItem) {
                      itemFullHeight = firstItem.offsetHeight + parseFloat(getComputedStyle(firstItem).marginBottom);
                  } else {
                      return; // No items yet
                  }
             }
    
             const containerHeight = segmentList.clientHeight;
             // Padding needed above first item and below last item
             const requiredPadding = (containerHeight / 2) - (itemFullHeight / 2);
    
             // Apply padding. Ensure padding is not negative.
             const paddingTopBottom = Math.max(0, requiredPadding);
             segmentList.style.paddingTop = `${paddingTopBottom}px`;
             segmentList.style.paddingBottom = `${paddingTopBottom}px`;
    
             // Re-calculate styles after padding changes
             updateStyles(); // THIS CALL IS NOW AFTER updateStyles IS DEFINED
         }
    
    
        // --- Scrolling and Animation Functions ---
    
        // Function to handle snapping animation
        // Needs getScrollTopToCenterElementIndex and updateStyles
        function scrollToSegment(index, duration, easing) {
            const segments = segmentList.querySelectorAll('.segment-item');
            if (index < 0 || index >= segments.length) return;
    
            const targetScrollTop = getScrollTopToCenterElementIndex(index);
    
            // Clear any existing timer to prevent triggering during continuous scrolling
            
    
            const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
            const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));
    
             // Only animate if the target is different from the current position by a threshold
            if (Math.abs(segmentList.scrollTop - clampedScrollTop) > 0.5) { // Use a small tolerance
                 // Stop any existing animation
                 if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
                      animation.pause();
                 }
    
                // Use anime.js to animate the scrollTop
                animation = anime({
                    targets: segmentList,
                    scrollTop: clampedScrollTop,
                    easing: easing,
                    duration: duration,
                    autoplay: true,
                    // The update callback can be expensive, only use if needed for visual smoothness
                    // update: () => { updateStyles(); },
                    complete: () => {
                         // Ensure styles are correct after animation finishes
                         updateStyles();
                         animation = null; // Clear animation reference on completion
                    }
                });
            } else {
                 // If already snapped, just ensure styles are correct
                 updateStyles();
            }
        }
    
        function delayedShowProjectDetails(modeName) {
            // Clear any existing timeout
            clearTimeout(showDetailsTimeout);
        
            // Set a new timeout to call the function after 1.5 seconds
            showDetailsTimeout = setTimeout(() => {
                showProjectDetails(modeName);
            }, 1500);
        }
    
    
        function handleScrollStop() {
            if (isDragging || (animation && animation.state !== 'stopped')) {
                // Don't snap if currently dragging or an animation is running
                return;
            }
        
            const closestIndex = getClosestElementIndexToCenter();
            if (closestIndex !== -1) {
                // Use elastic easing for the scroll stop snap
                scrollToSegment(closestIndex, 800, 'easeOutElastic(1, .8)');
                delayedShowProjectDetails(`Segment ${closestIndex + 1}`); // Call with segment name
            }
        }
    
    
        // --- Initialization Function ---
    
        // Function to create initial segment elements (all of them)
        function populateSegments() {
            segmentList.innerHTML = ''; // Clear existing
            segmentContent.forEach((content, index) => {
                const segmentItem = document.createElement('div');
                segmentItem.classList.add('segment-item');
                segmentItem.textContent = content;
                segmentItem.dataset.index = index; // Store original content index
                segmentList.appendChild(segmentItem);
            });
    
             // itemFullHeight calculation is moved to setDynamicPadding where it's first needed,
             // but you could calculate it here too. Let's keep it in setDynamicPadding for now.
        }
    
    
        // --- Event Handlers ---
    
        // Mouse Drag Implementation
        segmentList.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
        
            isDragging = true;
            startY = e.clientY;
            startScrollTop = segmentList.scrollTop;
            segmentList.style.cursor = 'grabbing';
        
            // Stop any active animation immediately on drag start
            if (animation && typeof animation.pause === 'function' && animation.state !== 'stopped') {
                animation.pause();
                animation = null; // Clear animation reference
            }
        
            // Temporarily remove scroll listener during drag
            segmentList.removeEventListener('scroll', handleScrollOnScroll);
        });
    
         // Listen on document to handle mousemove even if mouse leaves the list
         document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent default text selection, etc.
    
            const deltaY = e.clientY - startY;
            // Dragging the MOUSE DOWN (deltaY positive) should move the *content* down,
            // which means scrollTop should DECREASE.
            const newScrollTop = startScrollTop - deltaY;
    
            // Apply the new scroll position. Native overflow handles clamping to 0 and maxScrollTop.
            segmentList.scrollTop = newScrollTop;
    
            // Update styles during drag
            updateStyles(); // Call updateStyles frequently during drag for visual feedback
         });
    
         // Listen on document to handle mouseup anywhere
         document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            segmentList.style.cursor = 'grab';
        
            // Re-add the scroll listener
            if (!segmentList.dataset.scrollListenerAdded) {
                segmentList.addEventListener('scroll', handleScrollOnScroll);
                segmentList.dataset.scrollListenerAdded = 'true';
            }
        
            // Trigger snapping logic
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                handleScrollStop();
                delayedShowProjectDetails('Drag Ended'); // Call after dragging
            }, scrollStopDelay);
        });
    
        // Mouse Wheel Scrolling - Animate segment by segment
        // Needs getClosestElementIndexToCenter and scrollToSegment
        segmentList.addEventListener('wheel', (e) => {
            e.preventDefault(); // Prevent default wheel behavior
    
            // Ignore wheel if dragging or an animation is already running
            if (isDragging || (animation && animation.state !== 'stopped')) {
                 return;
            }
    
            const segments = segmentList.querySelectorAll('.segment-item');
            if (segments.length === 0) return;
    
            const closestIndex = getClosestElementIndexToCenter();
            if (closestIndex === -1) return; 
    
            let targetIndex = closestIndex;
            const direction = e.deltaY > 0 ? 1 : -1;
            targetIndex += direction;
            targetIndex = Math.max(0, Math.min(segments.length - 1, targetIndex));
            scrollToSegment(targetIndex, 250, 'easeInOutQuad'); 
            delayedShowProjectDetails(`Segment ${targetIndex + 1}`); 
            clearTimeout(scrollTimeout);
            clearTimeout(scrollTimeout);
    
        }, { passive: false }); 
        const handleScrollOnScroll = () => {
             // Update styles during scrolling (needed for drag)
             updateStyles();
    
             // Only set the timeout for snapping if we are NOT dragging and NOT actively animating
             if (!isDragging && (animation === null || animation.state === 'stopped')) {
                 scrollTimeout = setTimeout(handleScrollStop, scrollStopDelay);
             }
        };
    
        // Ensure the event listener is added only once initially
        if (!segmentList.dataset.scrollListenerAdded) {
            segmentList.addEventListener('scroll', handleScrollOnScroll);
            segmentList.dataset.scrollListenerAdded = 'true'; // Mark as added
        }
    
    
        segmentList.addEventListener('click', (e) => {
            if (dragEndedRecently) return;
        
            const clickedSegment = e.target.closest('.segment-item');
            if (!clickedSegment) return;
        
            const segments = segmentList.querySelectorAll('.segment-item');
            let clickedIndex = -1;
            segments.forEach((segment, index) => {
                if (segment === clickedSegment) {
                    clickedIndex = index;
                }
            });
        
            if (clickedIndex !== -1) {
                scrollToSegment(clickedIndex, 500, 'easeInOutQuad');
                clearTimeout(scrollTimeout);
                delayedShowProjectDetails(`Segment ${clickedIndex + 1}`); // Call with segment name
            }
        });
    
        populateSegments();
        requestAnimationFrame(() => {
             setDynamicPadding();
            const initialContentText = 'Segment 3 (Selected)'; 
            const segments = segmentList.querySelectorAll('.segment-item');
    
            let segmentToCenter = null;
            let initialSelectedIndex = -1;
    
            segments.forEach((segment, index) => {
                 if (segment.textContent === initialContentText) {
                     segmentToCenter = segment;
                     initialSelectedIndex = index;
                 }
            });
    
            if (segmentToCenter) {
                 const targetScrollTop = getScrollTopToCenterElementIndex(initialSelectedIndex);
                 // Clamp the initial scroll position
                 const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
                 const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));
    
                 segmentList.scrollTop = clampedScrollTop;
            } else {
                 // Fallback: Center the middle element if specific content not found
                 if (segments.length > 0) {
                      const middleElementIndex = Math.floor(segments.length / 2);
                      const targetScrollTop = getScrollTopToCenterElementIndex(middleElementIndex);
                       const maxScrollTop = segmentList.scrollHeight - segmentList.clientHeight;
                       const clampedScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop));
                      segmentList.scrollTop = clampedScrollTop;
                 }
            }
    
            // Ensure styles are correctly applied after setting initial scroll position
            updateStyles();
        });
    
         // Re-calculate padding and update styles on resize
         window.addEventListener('resize', debounce(() => {
             setDynamicPadding(); // This calls updateStyles
             handleScrollStop(); // Trigger snap after resize debounce
         }, 100));
    });
    
    function showProjectDetails(modeName)
    {
        console.log("showProjectDetails called with modeName:", modeName);
    }