# Đóng góp thêm sách

Site này là 1 thư viện tĩnh (không server, không build) tổng hợp insight từ sách về Product Management, UX, Design Thinking... Thêm 1 sách mới = 1 Pull Request, không cần liên hệ chủ repo trước. Mọi PR được kiểm tra tự động (GitHub Action) và có bản xem trước trực tiếp trên Cloudflare Pages trước khi merge.

## Tóm tắt nhanh — thêm 1 sách gồm 3 việc

1. Tạo folder `Books/{Tên Sách}/` chứa file HTML từng chương (copy từ `templates/chapter-template.html`).
2. Tạo 1 file `Books/{Tên Sách}/meta.json` mô tả sách.
3. Mở Pull Request.

Không đụng tới `index.html`, `Books/manifest.json`, hay folder của sách khác — mỗi PR chỉ nên chứa 1 folder sách mới (hoặc sửa đúng 1 sách đã có).

## 1. Folder & đặt tên file

- Tên folder = tên sách, viết thường như văn bản bình thường (có dấu cách/tiếng Việt đều được, không bắt buộc trùng `slug`). Ví dụ: `Books/The Mom Test/`.
- Tên file chương: `chNN-{viết-tắt-sách}.html` (số thứ tự 2 chữ số nếu sách có ≥10 chương, vd `ch01-`, `ch02-`...; ≤9 chương thì `ch1-`, `ch2-`... cũng được — miễn nhất quán trong cùng 1 sách).

## 2. Template HTML chương — bắt buộc

Copy từ [`templates/chapter-template.html`](templates/chapter-template.html), giữ nguyên:

- **`<link rel="stylesheet" href="../assets/theme.css">`** trong `<head>` — đây là theme dùng chung của toàn site (màu sắc, font Inter, layout đọc chương, style `book-topline`/`chapnav`), khớp với giao diện trang chủ. KHÔNG được xoá link này, KHÔNG định nghĩa lại token màu/font trong file của bạn.
- Chỉ thêm `<style>` riêng trong file nếu chương của bạn cần thành phần đặc thù (card, diagram, box minh hoạ...) — dùng token có sẵn trong `assets/theme.css` khi cần màu (`var(--color-slate-ink)`, `var(--color-parchment)`, `var(--color-sprout)`, `var(--color-dew)`...) thay vì tự đặt hex mới, để khi đổi theme sau này thành phần riêng của bạn cũng tự đổi theo.
- **`<p class="book-topline"><a href="../index.html#/book/{slug}">← Về mục lục</a></p>`** ngay đầu `<body>` — sửa `{slug}` đúng slug trong `meta.json` của sách. Đây là link duy nhất quay lại trang chủ.
- **`<nav class="chapnav">`** cuối file, chứa `<a href="{file-chương-trước}">`/`<a href="{file-chương-sau}">` — chương đầu tiên bỏ link "trước", chương cuối bỏ link "sau" (xem ví dụ thật ở bất kỳ file nào trong `Books/The Mom Test/`). `href` **không kèm đuôi `.html`** — Cloudflare Pages (và `dev-server.mjs` khi test local) tự khớp file `.html` tương ứng, URL hiện ra gọn hơn.
- File phải kết thúc đúng `</body></html>` — không cắt cụt giữa chừng.

**Automation sẽ fail PR nếu:** thiếu `book-topline`, thiếu `chapnav` hoặc `chapnav` không có `<a href>` thật bên trong (chỉ có `<span>` giả nhìn giống nút bấm), hoặc file HTML rỗng/không đóng thẻ đúng.

## 3. `meta.json`

Đặt cùng cấp với các file chương, trong chính folder sách đó. Ví dụ thật (rút gọn từ sách *The Mom Test* đang có trong site):

```json
{
  "slug": "the-mom-test",
  "title": "The Mom Test",
  "author": "Rob Fitzpatrick",
  "tag": "Customer Development · Phỏng Vấn Khách Hàng",
  "category": "Product Management",
  "chapters": [
    {
      "n": 1,
      "title": "Bài Kiểm Tra Của Mẹ",
      "sub": "Ba quy tắc cơ bản để đặt câu hỏi đúng khi phỏng vấn khách hàng",
      "slug": "bai-kiem-tra-cua-me",
      "file": "ch01-bai-kiem-tra-cua-me.html"
    },
    {
      "n": 2,
      "title": "Tránh Thu Thập Dữ Liệu Sai",
      "sub": "Ba loại phản hồi khiến bạn hiểu sai tình hình, dù đã đặt câu hỏi đúng",
      "slug": "tranh-thu-thap-du-lieu-sai",
      "file": "ch02-tranh-du-lieu-sai.html"
    }
  ]
}
```

Field bắt buộc:

| Field | Kiểu | Ghi chú |
|---|---|---|
| `slug` | string | kebab-case (`a-z`, `0-9`, dấu `-`), **duy nhất toàn site** — trùng slug với sách đã có (hoặc sách khác trong cùng PR) sẽ fail CI |
| `title` | string | tên sách hiển thị |
| `author` | string | tác giả · nguồn · năm (tuỳ chọn thêm vào chuỗi này) |
| `tag` | string | 1 dòng mô tả chủ đề, hiện dưới dạng badge trên trang chủ |
| `category` | string | 1 trong 5 giá trị cố định: `BFSI`, `UX/UI`, `Game Design`, `Product Management`, `Data/Tech` — dùng để lọc theo tab trên trang chủ |
| `chapters` | array | ≥1 phần tử, mỗi phần tử: `n` (số thứ tự), `title`, `sub` (có thể để chuỗi rỗng `""`), `slug` (kebab-case, **duy nhất trong sách** — dùng cho URL `/{slug-sách}/{slug-chương}`, xem Mục 5b), `file` (tên file HTML, **không** kèm đường dẫn folder — chỉ tên file, vì đã ở trong đúng folder sách) |

`file` không được chứa `../` (không được trỏ ra ngoài folder sách của bạn).

## 5b. URL sạch — không cần bạn làm gì thêm

Site dùng URL dạng `domain/{slug-sách}/{slug-chương}` cho mọi trang (vd `/the-mom-test/bai-kiem-tra-cua-me`) thay vì đường dẫn file thật. Việc ánh xạ URL sạch sang file vật lý nằm trong file `_redirects` ở gốc repo — **file này tự sinh bởi GitHub Action sau khi merge** (giống `manifest.json`), bạn không cần tự tạo hay sửa. Trong file chương của bạn, link `book-topline`/`chapnav` chỉ cần trỏ `href="/{slug-sách}"` hoặc `href="/{slug-sách}/{slug-chương-kia}"` — xem ví dụ thật trong bất kỳ sách nào khác.

## 4. Quy trình Pull Request

1. Fork repo (hoặc tạo branch nếu bạn đã là collaborator).
2. Thêm đúng 1 folder sách mới (hoặc sửa nội dung 1 sách đã có) — không chạm file/folder khác.
3. Mở Pull Request. Đợi check **validate-books** chạy xong (vài chục giây) — nếu fail, đọc annotation trên tab "Files changed" để biết sai ở đâu, sửa rồi push tiếp vào cùng PR.
4. Cloudflare Pages tự động comment 1 link **Preview Deployment** trên PR. Lưu ý: `manifest.json` và `_redirects` chỉ tự sinh **sau khi merge**, nên sách mới của bạn **chưa hiện trong trang chủ/mục lục**, và URL sạch `/{slug-sách}/{slug-chương}` **chưa hoạt động** trên bản preview (kể cả link `book-topline`/`chapnav` trong chính chương bạn vừa thêm) — để review, mở trực tiếp `{preview-url}/{folder-sách}/meta.json` và `{preview-url}/{folder-sách}/{file-chương}.html` theo URL (chương vẫn render đầy đủ theme vì `assets/theme.css` là file dùng chung của cả site, không phụ thuộc `index.html`).
5. Sau khi merge vào `main`: 1 GitHub Action khác tự quét lại toàn bộ sách và cập nhật `manifest.json` + `_redirects` — **không cần bạn làm gì thêm**, site chính thức sẽ tự có sách mới (hiện trong mục lục, URL sạch hoạt động đầy đủ) trong vài chục giây tới vài phút.

## 5. Automation kiểm tra gì

- `meta.json` đủ field bắt buộc, `slug` sách hợp lệ và không trùng toàn site, `slug` từng chương hợp lệ và không trùng trong cùng sách.
- Mọi `file` trong `chapters[]` tồn tại thật trong folder sách đó.
- File HTML chương (mới thêm/sửa trong PR) không rỗng, không bị cắt cụt, có link `assets/theme.css`, có `book-topline` + `chapnav` thật.

> Lưu ý: automation chỉ kiểm **có link theme.css hay không**, không kiểm màu/CSS riêng bạn tự thêm có khớp thẩm mỹ chung hay không — phần đó người review PR sẽ xem qua Preview Deployment trước khi merge.

## 6. Xem thử trên máy bạn (local preview)

Site dùng `fetch()` để tải danh sách sách lúc chạy — **không thể mở `index.html` bằng double-click** (trình duyệt chặn `fetch()` file local). Chạy:

```bash
node scripts/dev-server.mjs
```

rồi mở `http://localhost:8000/` trên trình duyệt. Dùng script này (không phải `python3 -m http.server`) vì link chương không kèm đuôi `.html` — `dev-server.mjs` mô phỏng đúng cách Cloudflare Pages tự khớp file `.html` khi URL không có đuôi; `python3 -m http.server` không hiểu điều này và sẽ 404.
