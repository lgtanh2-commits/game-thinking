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

- `<style>` tự chứa trong file (không link CSS ngoài) — có thể đổi màu/font tuỳ ý cho sách của bạn, nhưng nên giữ các biến CSS chuẩn để đồng bộ: `--bg`, `--text`, `--text-secondary`, `--text-muted`, `--border`, `--border-strong`, `--surface`, `--surface-dark`, `--accent-line`.
- **`<p class="book-topline"><a href="../index.html#/book/{slug}">← Về mục lục</a></p>`** ngay đầu `<body>` — sửa `{slug}` đúng slug trong `meta.json` của sách. Đây là link duy nhất quay lại trang chủ.
- **`<nav class="chapnav">`** cuối file, chứa `<a href="{file-chương-trước}.html">`/`<a href="{file-chương-sau}.html">` — chương đầu tiên bỏ link "trước", chương cuối bỏ link "sau" (xem ví dụ thật ở bất kỳ file nào trong `Books/The Mom Test/`).
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
  "chapters": [
    {
      "n": 1,
      "title": "Bài Kiểm Tra Của Mẹ",
      "sub": "Ba quy tắc cơ bản để đặt câu hỏi đúng khi phỏng vấn khách hàng",
      "file": "ch01-bai-kiem-tra-cua-me.html"
    },
    {
      "n": 2,
      "title": "Tránh Thu Thập Dữ Liệu Sai",
      "sub": "Ba loại phản hồi khiến bạn hiểu sai tình hình, dù đã đặt câu hỏi đúng",
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
| `chapters` | array | ≥1 phần tử, mỗi phần tử: `n` (số thứ tự), `title`, `sub` (có thể để chuỗi rỗng `""`), `file` (tên file HTML, **không** kèm đường dẫn folder — chỉ tên file, vì đã ở trong đúng folder sách) |

`file` không được chứa `../` (không được trỏ ra ngoài folder sách của bạn).

## 4. Quy trình Pull Request

1. Fork repo (hoặc tạo branch nếu bạn đã là collaborator).
2. Thêm đúng 1 folder sách mới (hoặc sửa nội dung 1 sách đã có) — không chạm file/folder khác.
3. Mở Pull Request. Đợi check **validate-books** chạy xong (vài chục giây) — nếu fail, đọc annotation trên tab "Files changed" để biết sai ở đâu, sửa rồi push tiếp vào cùng PR.
4. Cloudflare Pages tự động comment 1 link **Preview Deployment** trên PR — bấm vào xem sách của bạn hiển thị thật trên site (mục lục, đọc từng chương, nav chuyển chương) trước khi merge.
5. Sau khi merge vào `main`: 1 GitHub Action khác tự quét lại toàn bộ sách và cập nhật `Books/manifest.json` — **không cần bạn làm gì thêm**, site sẽ tự có sách mới trong vài chục giây tới vài phút.

## 5. Automation kiểm tra gì

- `meta.json` đủ field bắt buộc, `slug` hợp lệ và không trùng.
- Mọi `file` trong `chapters[]` tồn tại thật trong folder sách đó.
- File HTML chương (mới thêm/sửa trong PR) không rỗng, không bị cắt cụt, có `book-topline` + `chapnav` thật.

## 6. Xem thử trên máy bạn (local preview)

Site dùng `fetch()` để tải danh sách sách lúc chạy — **không thể mở `index.html` bằng double-click** (trình duyệt chặn `fetch()` file local). Chạy 1 server tĩnh nhỏ trong thư mục `Books/`:

```bash
python3 -m http.server 8000
```

rồi mở `http://localhost:8000/` trên trình duyệt.
