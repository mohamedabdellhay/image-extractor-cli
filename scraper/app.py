import requests
from bs4 import BeautifulSoup
import pandas as pd

def scrape_category(url, output_file="products.xlsx"):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    products = []

    # كل منتج جوة div.product-item (غيره لو مختلف في الموقع)
    for product in soup.select(".flash-sale-card-wrap-anchor"):
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
    # حفظ في اكسل
    df = pd.DataFrame(products)
    df.to_excel(output_file, index=False)
    print(f"✅ تم استخراج {len(products)} منتج وحفظهم في {output_file}")


if __name__ == "__main__":
    url = "https://elghazawy.com/ar/offers"  # غير اللينك هنا
    scrape_category(url, "products.xlsx")
