<?php
header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/config.php';

# вызываем нейронку
define('SEMANTIC_BASE_URL', getenv('SEMANTIC_URL') ?: 'http://127.0.0.1:8000');
function call_semantic_search(string $query, int $topK = 20): array
{
    $url = SEMANTIC_BASE_URL . '/search?q=' . urlencode($query) . '&top_k=' . $topK;

    $context = stream_context_create([
        'http' => [
            'timeout' => 0.7,
        ],
    ]);

    $json = @file_get_contents($url, false, $context);
    if ($json === false) {
        return [];
    }

    $data = json_decode($json, true);
    if (!is_array($data)) {
        return [];
    }

    $ids = [];
    foreach ($data as $row) {
        if (isset($row['id'])) {
            $ids[] = (int)$row['id'];
        }
    }
    return array_values(array_unique($ids));
}

# чтение параметров запроса
$search = isset($_GET['q']) ? trim($_GET['q']) : '';
$qty    = isset($_GET['qty']) ? (int)$_GET['qty'] : 1;
$qty    = $qty > 0 ? $qty : 1;
$sort   = isset($_GET['sort']) ? $_GET['sort'] : 'price';

$orderByMap = [
    'price'     => 'o.price_no_vat',
    'lead_time' => 'o.lead_time_days',
];
$orderBy = $orderByMap[$sort] ?? $orderByMap['price'];

$response = [
    'product'           => null,
    'requested_qty'     => $qty,
    'allocation'        => [],
    'totals'            => null,
    'offers'            => [],
    'remaining'         => $qty,
    'distinct_products' => 0,
    'error'             => null,
];

if ($search === '') {
    $response['error'] = 'Пустой запрос';
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

# определяем, похоже ли это на артикул
$normalized = preg_replace('/\s+/', '', $search);
$isSkuSearch = (strpos($normalized, ' ') === false) && preg_match('/\d/', $normalized);

try {
    if ($isSkuSearch) {
        # по артикулу нейронка не работает
        $sql = "
            SELECT o.*, p.name AS product_name, p.sku,
                   s.name AS supplier_name, s.city
            FROM offers o
            JOIN products p ON o.product_id = p.id
            LEFT JOIN suppliers s ON o.supplier_id = s.id
            WHERE p.sku LIKE :sku
               OR p.name LIKE :name
            ORDER BY {$orderBy} ASC
        ";
        $stmt = $pdo->prepare($sql);
        $like = '%' . $search . '%';
        $stmt->execute([
            'sku'  => $like,
            'name' => $like,
        ]);
    } else {
        $productIds = call_semantic_search($search, 30);

        if (!empty($productIds)) {
            $placeholders = implode(',', array_fill(0, count($productIds), '?'));
            $sql = "
                SELECT o.*, p.name AS product_name, p.sku,
                       s.name AS supplier_name, s.city
                FROM offers o
                JOIN products p ON o.product_id = p.id
                LEFT JOIN suppliers s ON o.supplier_id = s.id
                WHERE p.id IN ($placeholders)
                ORDER BY {$orderBy} ASC
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($productIds);
        } else {
            # в случае чего обычный like
            $sql = "
                SELECT o.*, p.name AS product_name, p.sku,
                       s.name AS supplier_name, s.city
                FROM offers o
                JOIN products p ON o.product_id = p.id
                LEFT JOIN suppliers s ON o.supplier_id = s.id
                WHERE p.sku LIKE :like
                   OR p.name LIKE :like
                ORDER BY {$orderBy} ASC
            ";
            $stmt = $pdo->prepare($sql);
            $like = '%' . $search . '%';
            $stmt->execute(['like' => $like]);
        }
    }

    $offers = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    http_response_code(500);
    $response['error'] = 'Ошибка при выполнении запроса к БД';
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$offers) {
    $response['error'] = 'Ничего не найдено';
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

# количество разных товаров
$productIdsMap = [];
foreach ($offers as $offer) {
    $productIdsMap[$offer['product_id']] = true;
}
$distinctProductsCount = count($productIdsMap);
$response['distinct_products'] = $distinctProductsCount;

# если товар один - делаем подбор по поставщикам
if ($distinctProductsCount === 1) {
    $first = $offers[0];
    $response['product'] = [
        'sku'  => $first['sku'],
        'name' => $first['product_name'],
    ];

    $remaining     = $qty;
    $allocation    = [];
    $totalNoVat    = 0.0;
    $totalWithVat  = 0.0;

    foreach ($offers as $offer) {
        if ($remaining <= 0) {
            break;
        }
        if ((int)$offer['stock'] <= 0) {
            continue;
        }

        $take = min($remaining, (int)$offer['stock']);

        $priceNoVat   = (float)$offer['price_no_vat'];
        $vatRate      = (float)$offer['vat_rate'];
        $priceWithVat = $priceNoVat * (1 + $vatRate / 100);

        $lineNoVat    = $priceNoVat * $take;
        $lineWithVat  = $priceWithVat * $take;

        $allocation[] = [
            'supplier_name'       => $offer['supplier_name'],
            'city'                => $offer['city'],
            'lead_time_days'      => (int)$offer['lead_time_days'],
            'take'                => $take,
            'price_no_vat'        => $priceNoVat,
            'price_with_vat'      => $priceWithVat,
            'line_total_no_vat'   => $lineNoVat,
            'line_total_with_vat' => $lineWithVat,
        ];

        $totalNoVat   += $lineNoVat;
        $totalWithVat += $lineWithVat;
        $remaining    -= $take;
    }

    $response['allocation'] = $allocation;
    $response['totals'] = [
        'total_no_vat'    => $totalNoVat,
        'total_with_vat'  => $totalWithVat,
        'allocated_qty'   => $qty - $remaining,
        'missing_qty'     => $remaining > 0 ? $remaining : 0,
    ];
    $response['remaining'] = $remaining;
} else {
    $response['product']    = null;
    $response['allocation'] = [];
    $response['totals']     = null;
}

# cписок всех предложений для таблицы
$response['offers'] = array_map(function (array $offer) {
    $priceNoVat   = (float)$offer['price_no_vat'];
    $vatRate      = (float)$offer['vat_rate'];
    $priceWithVat = $priceNoVat * (1 + $vatRate / 100);

    return [
        'product_id'     => (int)$offer['product_id'],
        'sku'            => $offer['sku'],
        'product_name'   => $offer['product_name'],
        'supplier_name'  => $offer['supplier_name'],
        'city'           => $offer['city'],
        'stock'          => (int)$offer['stock'],
        'lead_time_days' => (int)$offer['lead_time_days'],
        'price_no_vat'   => $priceNoVat,
        'price_with_vat' => $priceWithVat,
    ];
}, $offers);

echo json_encode($response, JSON_UNESCAPED_UNICODE);
