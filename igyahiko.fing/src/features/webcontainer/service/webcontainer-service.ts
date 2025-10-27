// lib/webcontainer-service.ts
import { WebContainer } from '@webcontainer/api';

class WebContainerService {
  private static instance: WebContainer | null = null;
  private static isBooting = false;
  private static bootPromise: Promise<WebContainer> | null = null;

  static async getInstance(): Promise<WebContainer> {
    if (this.instance) {
      return this.instance;
    }

    // If already booting, return the existing promise
    if (this.bootPromise) {
      return this.bootPromise;
    }

    this.isBooting = true;
    this.bootPromise = new Promise(async (resolve, reject) => {
      try {
        console.log('Booting WebContainer...');
        this.instance = await WebContainer.boot();
        console.log('WebContainer booted successfully');
        resolve(this.instance);
      } catch (error) {
        console.error('Failed to boot WebContainer:', error);
        this.isBooting = false;
        this.bootPromise = null;
        reject(error);
      }
    });

    return this.bootPromise;
  }

  static hasInstance(): boolean {
    return this.instance !== null;
  }

  static isInitializing(): boolean {
    return this.isBooting;
  }

  static async destroyInstance(): Promise<void> {
    if (this.instance) {
      try {
        await this.instance.teardown();
      } catch (error) {
        console.warn('Error during WebContainer teardown:', error);
      }
      this.instance = null;
    }
    this.isBooting = false;
    this.bootPromise = null;
  }
}

export default WebContainerService;