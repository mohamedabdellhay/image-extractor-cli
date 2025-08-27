import sys
import requests
from bs4 import BeautifulSoup
import pandas as pd
import argparse
import textwrap
import threading
import time
import os

class Spinner:
    """A simple spinner class for showing loading animation"""
    def __init__(self, message="Loading...", delay=0.1):
        self.spinner_chars = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]
        self.delay = delay
        self.message = message
        self.running = False
        self.spinner_thread = None
    
    def spin(self):
        i = 0
        while self.running:
            sys.stdout.write(f"\r{self.spinner_chars[i]} {self.message}")
            sys.stdout.flush()
            time.sleep(self.delay)
            i = (i + 1) % len(self.spinner_chars)
    
    def __enter__(self):
        self.running = True
        self.spinner_thread = threading.Thread(target=self.spin)
        self.spinner_thread.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.running = False
        if self.spinner_thread:
            self.spinner_thread.join()
        # Clear the spinner line
        sys.stdout.write("\r" + " " * (len(self.message) + 2) + "\r")
        sys.stdout.flush()

def scrape_category(url, selector, output_file="products.xlsx"):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
    }

    try:
        with Spinner("Fetching webpage..."):
            response = requests.get(url, headers=headers)
            response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching the URL: {e}")
        return False

    with Spinner("Parsing content..."):
        soup = BeautifulSoup(response.text, "html.parser")

    products = []

    with Spinner("Extracting products..."):
        # كل منتج جوة div.product-item (غيره لو مختلف في الموقع)
        for product in soup.select(selector):
            # العنوان
            title_tag = product.get("href") 
            title = title_tag

            # الصورة
            img_tag = product.find("img")
            if img_tag:
                img_url = img_tag.get("data-src") or img_tag.get("src")
            else:
                img_url = None

            image_size_kb = None
            if img_url:
                try:
                    img_resp = requests.get(img_url, stream=True, timeout=10)
                    if "Content-Length" in img_resp.headers:
                        image_size_kb = int(img_resp.headers["Content-Length"]) / 1024
                    else:
                        image_size_kb = len(img_resp.content) / 1024
                    image_size_kb = round(image_size_kb, 2)  # تقريب لـ 2 decimal places
                except Exception as e:
                    image_size_kb = None

            products.append({
                "Title": title,
                "Image": img_url,
                "ImageSizeKB": image_size_kb
            })
  
    if products:
        with Spinner("Saving to Excel file..."):
            df = pd.DataFrame(products)
            df.to_excel(output_file, index=False)
        print(f"✅ Extracted {len(products)} product and saved in {output_file}")
        return True
    else:
        print("❌ No products found with the provided selector")
        return False

def print_banner():
    """Print a nice banner for the application"""
    banner = """
    ╔══════════════════════════════════════════════════╗
    ║              🕷️  WEB PRODUCT SCRAPER              ║
    ║            Extract products to Excel             ║
    ╚══════════════════════════════════════════════════╝
    """
    print(banner)

def main():
    # Print banner
    print_banner()
    
    # Create the CLI interface
    parser = argparse.ArgumentParser(
        description="Web Scraper for Product Data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent('''
        Examples:
          python app.py https://example.com/products ".product-item"
          python app.py https://example.com/products ".product-card" --output my_products.xlsx
          python app.py https://example.com/products ".item" -v
        ''')
    )
    
    parser.add_argument('url', help='URL of the website to scrape')
    parser.add_argument('selector', help='CSS selector for products (e.g., ".product-item")')
    parser.add_argument('-o', '--output', help='Output Excel filename (default: auto-generated from URL)')
    parser.add_argument('-v', '--verbose', action='store_true', help='Enable verbose output')
    
    args = parser.parse_args()
    
    if args.verbose:
        print(f"🌐 Target URL: {args.url}")
        print(f"🔍 Selector: {args.selector}")
    
    # Determine output filename
    if args.output:
        output_file = args.output
    else:
        # Extract domain name for default filename
        from urllib.parse import urlparse
        parsed_url = urlparse(args.url)
        domain = parsed_url.netloc.replace('www.', '').split('.')[0]
        page_name = parsed_url.path.split('/')[-1] or "products"
        output_file = f"{domain}_{page_name}.xlsx"
    
    if args.verbose:
        print(f"💾 Output file: {output_file}")
    
    # Run the scraper
    print("🚀 Starting scraping process...")
    success = scrape_category(args.url, args.selector, output_file)
    
    if success:
        # Get file size
        try:
            file_size = os.path.getsize(output_file) / 1024
            print(f"📊 File size: {file_size:.2f} KB")
        except OSError:
            pass
            
        print("✨ Scraping completed successfully!")
        sys.exit(0)
    else:
        print("💥 Scraping failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()