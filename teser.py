import asyncio
import aiohttp
import json
import time

async def test_single_upscale(session, image_url, scale, test_id):
    """Test a single upscale request"""
    url = "http://localhost:8000/upscale"
    
    payload = {
        "img_url": image_url,
        "scale": scale
    }
    
    start_time = time.time()
    
    try:
        async with session.post(url, json=payload) as response:
            result = await response.json()
            
            total_time = time.time() - start_time
            
            print(f"\n--- Test {test_id} ---")
            print(f"Status: {response.status}")
            print(f"Total time (including network): {total_time:.2f}s")
            
            if response.status == 200 and result.get("success"):
                print(f"✓ Upscaling successful!")
                print(f"  Original: {result['original_size']['width']}x{result['original_size']['height']}")
                print(f"  Upscaled: {result['upscaled_size']['width']}x{result['upscaled_size']['height']}")
                print(f"  Processing time: {result['processing_time']}s")
                print(f"  File: {result['file_path']}")
                return {
                    "success": True,
                    "test_id": test_id,
                    "total_time": total_time,
                    "processing_time": result['processing_time'],
                    "original_size": result['original_size'],
                    "upscaled_size": result['upscaled_size'],
                    "file_path": result['file_path']
                }
            else:
                print(f"✗ Upscaling failed: {result.get('error')}")
                return {
                    "success": False,
                    "test_id": test_id,
                    "total_time": total_time,
                    "error": result.get('error')
                }
                
    except Exception as e:
        total_time = time.time() - start_time
        print(f"\n--- Test {test_id} ---")
        print(f"✗ Error: {e}")
        return {
            "success": False,
            "test_id": test_id,
            "total_time": total_time,
            "error": str(e)
        }

async def test_concurrent_upscale():
    """Test concurrent upscaling with multiple images"""
    
    # Test images
    images = [
        "https://cdn.hswstatic.com/gif/how-to-draw-buildings-15.jpg",
        "https://www.toureiffel.paris/sites/default/files/styles/largeur_450px/public/actualite/image_principale/vue_depuisjardins_webbanner_3.jpg?itok=w6PhGXsz"
    ]
    
    scale = 4
    
    print(f"Testing concurrent upscaling with {len(images)} images at scale={scale}...")
    print("Images:")
    for i, img in enumerate(images, 1):
        print(f"  {i}. {img}")
    
    overall_start = time.time()
    
    try:
        timeout = aiohttp.ClientTimeout(total=600)  # 10 minutes for scale=4
        async with aiohttp.ClientSession(timeout=timeout) as session:
            
            # Create concurrent tasks
            tasks = []
            for i, image_url in enumerate(images, 1):
                task = test_single_upscale(session, image_url, scale, f"Image_{i}")
                tasks.append(task)
            
            # Run all tasks concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            overall_time = time.time() - overall_start
            
            # Print summary
            print(f"\n{'='*60}")
            print(f"CONCURRENCY TEST SUMMARY")
            print(f"{'='*60}")
            print(f"Total overall time: {overall_time:.2f}s")
            print(f"Number of images: {len(images)}")
            print(f"Scale factor: {scale}")
            
            successful = 0
            failed = 0
            total_processing_time = 0
            
            for result in results:
                if isinstance(result, Exception):
                    print(f"Task failed with exception: {result}")
                    failed += 1
                elif result['success']:
                    successful += 1
                    total_processing_time += result['processing_time']
                    print(f"\n✓ {result['test_id']}: {result['processing_time']:.2f}s processing")
                else:
                    failed += 1
                    print(f"\n✗ {result['test_id']}: {result['error']}")
            
            print(f"\nResults:")
            print(f"  Successful: {successful}/{len(images)}")
            print(f"  Failed: {failed}/{len(images)}")
            
            if successful > 0:
                avg_processing_time = total_processing_time / successful
                print(f"  Average processing time: {avg_processing_time:.2f}s")
                print(f"  Concurrency benefit: {(avg_processing_time * len(images) - overall_time):.2f}s saved")
                
                efficiency = (avg_processing_time * successful) / overall_time * 100
                print(f"  Efficiency: {efficiency:.1f}% (100% = perfect parallelization)")
    
    except Exception as e:
        print(f"Overall test failed: {e}")

async def test_health_and_status():
    """Check server health and status before testing"""
    try:
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            
            # Health check
            async with session.get("http://localhost:8000/health") as response:
                health = await response.json()
                print("Health check:")
                print(f"  Status: {health['status']}")
                print(f"  Max file size: {health['max_file_size_mb']}MB")
                print(f"  Max dimension: {health['max_dimension']}px")
                
            # Status check
            async with session.get("http://localhost:8000/status") as response:
                status = await response.json()
                print(f"\nStatus check:")
                print(f"  Model servers: {status['model_servers']}")
                print(f"  Thread pool workers: {status['thread_pool_workers']}")
                print(f"  Cleanup running: {status['cleanup_task_running']}")
                print(f"  Upload folder: {status['upload_folder_stats']['total_files']} files, {status['upload_folder_stats']['total_size_mb']}MB")
                
                return status['model_servers'] > 0
    
    except Exception as e:
        print(f"Health/Status check failed: {e}")
        return False

if __name__ == "__main__":
    async def main():
        print("Checking server health and status...")
        
        if await test_health_and_status():
            print(f"\n{'='*60}")
            await test_concurrent_upscale()
        else:
            print("\n✗ Server not ready or model servers not available")
    
    asyncio.run(main())