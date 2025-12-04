<?php
header('Content-Type: application/json; charset=utf-8');

require_once 'config.php';

$search = isset($_GET['q']) ? trim($_GET['q']) : '';
$qty    = isset($_GET['qty']) ? (int)$_GET['qty'] : 1;
if ($qty <= 0) $qty = 1;

$sort   = isset($_GET['sort']) ? $_GET['sort'] : 'price';

$orderByMap = [
    'price'     => 'o.price_no_vat',
    'lead_time' => 'o.lead_time_days'
];

$orderBy = isset($orderByMap[$sort]) ? $orderByMap[$sort] : $orderByMap['price'];

$response = [
    'product'        => null,
    'requested_qty'  => $qty,
    'allocation'     => [],
    'totals'         => null,
    'offers'         => [],
    'remaining'      => $qty,
    'error'          => null,
];

if ($search === '') {
    $response['error'] = 'Пустой запрос';
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

$sql = "
    SELECT 
        o.*,
        p.name AS product_name,
        p.sku,
        s.name AS supplier_name,
        s.city
    FROM offers o
    JOIN products p ON o.product_id = p.id
    JOIN suppliers s ON o.supplier_id = s.id
    WHERE p.sku LIKE :like OR p.name LIKE :like
    ORDER BY {$orderBy} ASC
";

$stmt = $pdo->prepare($sql);
$like = '%' . $search . '%';
$stmt->execute(['like' => $like]);
$offers = $stmt->fetchAll();

if (!$offers) {
    $response['error'] = 'Ничего не найдено';
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

$response['product'] = [
    'sku'  => $offers[0]['sku'],
    'name' => $offers[0]['product_name']
];

$productIds = [];
foreach ($offers as $offer) {
    $productIds[$offer['product_id']] = true;
}
$distinctProductsCount = count($productIds);

// если товаров ровно один – можно считать подбор и итоги
if ($distinctProductsCount === 1) {
    $first = $offers[0];
    $response['product'] = [
        'sku'  => $first['sku'],
        'name' => $first['product_name'],
    ];

    $remaining = $qty;
    $allocation = [];
    $totalNoVat = 0;
    $totalWithVat = 0;

    foreach ($offers as $offer) {
        if ($remaining <= 0) break;
        if ((int)$offer['stock'] <= 0) continue;

        $take = min($remaining, (int)$offer['stock']);

        $priceNoVat   = (float)$offer['price_no_vat'];
        $vatRate      = (float)$offer['vat_rate'];
        $priceWithVat = $priceNoVat * (1 + $vatRate / 100);

        $lineNoVat    = $priceNoVat * $take;
        $lineWithVat  = $priceWithVat * $take;

        $allocation[] = [
            'supplier_name'      => $offer['supplier_name'],
            'city'               => $offer['city'],
            'lead_time_days'     => (int)$offer['lead_time_days'],
            'take'               => $take,
            'price_no_vat'       => $priceNoVat,
            'price_with_vat'     => $priceWithVat,
            'line_total_no_vat'  => $lineNoVat,
            'line_total_with_vat'=> $lineWithVat,
        ];

        $totalNoVat   += $lineNoVat;
        $totalWithVat += $lineWithVat;

        $remaining -= $take;
    }

    $response['allocation'] = $allocation;
    $response['totals'] = [
        'total_no_vat'   => $totalNoVat,
        'total_with_vat' => $totalWithVat,
        'allocated_qty'  => $qty - $remaining,
        'missing_qty'    => $remaining > 0 ? $remaining : 0
    ];
    $response['remaining'] = $remaining;
} else {
    $response['product']    = null;
    $response['allocation'] = [];
    $response['totals']     = null;
}

$response['distinct_products'] = $distinctProductsCount;

$response['offers'] = array_map(function ($offer) {
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

$remaining = $qty;
$allocation = [];
$totalNoVat = 0;
$totalWithVat = 0;

foreach ($offers as $offer) {
    if ($remaining <= 0) break;
    if ((int)$offer['stock'] <= 0) continue;

    $take = min($remaining, (int)$offer['stock']);

    $priceNoVat   = (float)$offer['price_no_vat'];
    $vatRate      = (float)$offer['vat_rate'];
    $priceWithVat = $priceNoVat * (1 + $vatRate / 100);

    $lineNoVat    = $priceNoVat * $take;
    $lineWithVat  = $priceWithVat * $take;

    $allocation[] = [
        'supplier_name'      => $offer['supplier_name'],
        'city'               => $offer['city'],
        'lead_time_days'     => (int)$offer['lead_time_days'],
        'take'               => $take,
        'price_no_vat'       => $priceNoVat,
        'price_with_vat'     => $priceWithVat,
        'line_total_no_vat'  => $lineNoVat,
        'line_total_with_vat'=> $lineWithVat,
    ];

    $totalNoVat   += $lineNoVat;
    $totalWithVat += $lineWithVat;

    $remaining -= $take;
}

$response['allocation'] = $allocation;
$response['totals'] = [
    'total_no_vat'   => $totalNoVat,
    'total_with_vat' => $totalWithVat,
    'allocated_qty'  => $qty - $remaining,
    'missing_qty'    => $remaining > 0 ? $remaining : 0
];
$response['remaining'] = $remaining;

echo json_encode($response, JSON_UNESCAPED_UNICODE);
