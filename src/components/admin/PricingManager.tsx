import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Save, Plus, Trash2, Edit, GripVertical, TestTube, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCalculator } from '@/hooks/useCalculator';
import { useCalculatorOptions } from '@/hooks/useCalculatorOptions';

interface ProjectType {
  id: string;
  name: string;
  display_name: string;
  base_price_per_sqft: number;
  base_material_cost_per_sqft: number;
  base_labor_cost_per_sqft: number;
  min_sqft: number;
  max_sqft: number;
  active: boolean;
}

interface OptionCategory {
  id: string;
  project_type_id: string;
  name: string;
  description: string | null;
  display_order: number;
  required: boolean;
  active: boolean;
}

interface OptionItem {
  id: string;
  option_category_id: string;
  name: string;
  description: string | null;
  material_cost: number;
  labor_cost: number;
  total_cost: number;
  labor_hours: number | null;
  modifier_type: string | null;
  modifier_value: number | null;
  display_label: string | null;
  materials_list: any;
  display_order: number;
  active: boolean;
}

interface Material {
  material_name: string;
  quantity_formula: string;
  unit: string;
  waste_factor: number;
}

export function PricingManager() {
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [selectedProjectType, setSelectedProjectType] = useState<string>('');
  const [categories, setCategories] = useState<OptionCategory[]>([]);
  const [items, setItems] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<OptionCategory | null>(null);
  const [editingItem, setEditingItem] = useState<OptionItem | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testSquareFootage, setTestSquareFootage] = useState<number>(100);
  
  // Load calculator options for test calculator
  const { data: testCategories = [] } = useCalculatorOptions(selectedProjectType);
  const currentProjectType = projectTypes.find(pt => pt.id === selectedProjectType);
  const { formData: testFormData, updateFormData: updateTestFormData, calculateEstimate: calculateTestEstimate } = useCalculator(
    currentProjectType as any || null,
    testCategories
  );
  const [showBulkAdjustDialog, setShowBulkAdjustDialog] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState<Partial<OptionCategory>>({});
  const [itemFormData, setItemFormData] = useState<Partial<OptionItem>>({});
  const [itemMaterials, setItemMaterials] = useState<Material[]>([]);

  useEffect(() => {
    loadProjectTypes();
  }, []);

  useEffect(() => {
    if (selectedProjectType) {
      loadCategories();
      loadItems();
    }
  }, [selectedProjectType]);

  const loadProjectTypes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('calculator_project_types')
        .select('*')
        .eq('active', true)
        .eq('has_calculator_options', true)
        .order('name');

      if (error) throw error;
      setProjectTypes(data || []);
      if (data && data.length > 0) {
        setSelectedProjectType(data[0].id);
      }
    } catch (error) {
      console.error('Error loading project types:', error);
      toast({
        title: "Error",
        description: "Failed to load project types",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('calculator_option_categories')
        .select('*')
        .eq('project_type_id', selectedProjectType)
        .order('display_order');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadItems = async () => {
    try {
      const { data, error } = await supabase
        .from('calculator_option_items')
        .select('*')
        .in('option_category_id', categories.map(c => c.id))
        .order('display_order');

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
    }
  };

  const saveBasePricing = async (updates: Partial<ProjectType>) => {
    if (!selectedProjectType) return;

    try {
      const { error } = await supabase
        .from('calculator_project_types')
        .update(updates)
        .eq('id', selectedProjectType);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Base pricing updated"
      });

      loadProjectTypes();
    } catch (error) {
      console.error('Error updating base pricing:', error);
      toast({
        title: "Error",
        description: "Failed to update base pricing",
        variant: "destructive"
      });
    }
  };

  const saveCategory = async () => {
    try {
      if (editingCategory?.id) {
        const { error } = await supabase
          .from('calculator_option_categories')
          .update(categoryFormData)
          .eq('id', editingCategory.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('calculator_option_categories')
          .insert(categoryFormData as any);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Category ${editingCategory ? 'updated' : 'created'}`
      });

      setShowCategoryDialog(false);
      setEditingCategory(null);
      setCategoryFormData({});
      loadCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      toast({
        title: "Error",
        description: "Failed to save category",
        variant: "destructive"
      });
    }
  };

  const saveItem = async () => {
    try {
      const materialCost = Number(itemFormData.material_cost) || 0;
      const laborCost = Number(itemFormData.labor_cost) || 0;
      const totalCost = materialCost + laborCost;

      const itemData = {
        ...itemFormData,
        material_cost: materialCost,
        labor_cost: laborCost,
        total_cost: totalCost,
        materials_list: itemMaterials.length > 0 ? itemMaterials as any : []
      };

      if (editingItem?.id) {
        const { error } = await supabase
          .from('calculator_option_items')
          .update(itemData)
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('calculator_option_items')
          .insert(itemData as any);

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Option ${editingItem ? 'updated' : 'created'}`
      });

      setShowItemDialog(false);
      setEditingItem(null);
      setItemFormData({});
      setItemMaterials([]);
      loadItems();
    } catch (error) {
      console.error('Error saving item:', error);
      toast({
        title: "Error",
        description: "Failed to save option",
        variant: "destructive"
      });
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category and all its options?')) return;

    try {
      const { error } = await supabase
        .from('calculator_option_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Category deleted"
      });

      loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive"
      });
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this option?')) return;

    try {
      const { error } = await supabase
        .from('calculator_option_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Option deleted"
      });

      loadItems();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "Error",
        description: "Failed to delete option",
        variant: "destructive"
      });
    }
  };

  const bulkAdjustLabor = async (percentage: number) => {
    if (!selectedProjectType) return;

    try {
      const categoryIds = categories.map(c => c.id);
      const affectedItems = items.filter(i => categoryIds.includes(i.option_category_id));

      for (const item of affectedItems) {
        const newLaborCost = item.labor_cost * (1 + percentage / 100);
        const newTotalCost = item.material_cost + newLaborCost;

        await supabase
          .from('calculator_option_items')
          .update({
            labor_cost: newLaborCost,
            total_cost: newTotalCost
          })
          .eq('id', item.id);
      }

      toast({
        title: "Success",
        description: `Adjusted labor costs for ${affectedItems.length} options`
      });

      setShowBulkAdjustDialog(false);
      loadItems();
    } catch (error) {
      console.error('Error adjusting labor:', error);
      toast({
        title: "Error",
        description: "Failed to adjust labor costs",
        variant: "destructive"
      });
    }
  };

  const openEditCategory = (category: OptionCategory) => {
    setEditingCategory(category);
    setCategoryFormData(category);
    setShowCategoryDialog(true);
  };

  const openEditItem = (item: OptionItem) => {
    setEditingItem(item);
    setItemFormData(item);
    setItemMaterials(item.materials_list || []);
    setShowItemDialog(true);
  };

  const openNewItem = (categoryId: string) => {
    setEditingItem(null);
    setItemFormData({ option_category_id: categoryId, active: true });
    setItemMaterials([]);
    setShowItemDialog(true);
  };

  const addMaterial = () => {
    setItemMaterials([...itemMaterials, { material_name: '', quantity_formula: '', unit: '', waste_factor: 0 }]);
  };

  const updateMaterial = (index: number, field: keyof Material, value: string | number) => {
    const updated = [...itemMaterials];
    updated[index] = { ...updated[index], [field]: value };
    setItemMaterials(updated);
  };

  const removeMaterial = (index: number) => {
    setItemMaterials(itemMaterials.filter((_, i) => i !== index));
  };

  // Moved to above with hooks

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pricing Management</CardTitle>
          <CardDescription>
            Manage calculator pricing, options, and cost modifiers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label>Project Type</Label>
              <Select value={selectedProjectType} onValueChange={setSelectedProjectType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectTypes.map(pt => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {currentProjectType && (
              <Tabs defaultValue="base-pricing">
                <TabsList>
                  <TabsTrigger value="base-pricing">Base Pricing</TabsTrigger>
                  <TabsTrigger value="options">Options Management</TabsTrigger>
                  <TabsTrigger value="test">Test Calculator</TabsTrigger>
                </TabsList>

                <TabsContent value="base-pricing" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Base Pricing Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Base Price per Sq Ft</Label>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={currentProjectType.base_price_per_sqft}
                          onBlur={(e) => saveBasePricing({ base_price_per_sqft: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>Material Cost per Sq Ft</Label>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={currentProjectType.base_material_cost_per_sqft}
                          onBlur={(e) => saveBasePricing({ base_material_cost_per_sqft: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>Labor Cost per Sq Ft</Label>
                        <Input
                          type="number"
                          step="0.01"
                          defaultValue={currentProjectType.base_labor_cost_per_sqft}
                          onBlur={(e) => saveBasePricing({ base_labor_cost_per_sqft: parseFloat(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>Minimum Sq Ft</Label>
                        <Input
                          type="number"
                          defaultValue={currentProjectType.min_sqft}
                          onBlur={(e) => saveBasePricing({ min_sqft: parseInt(e.target.value) })}
                        />
                      </div>
                      <div>
                        <Label>Maximum Sq Ft</Label>
                        <Input
                          type="number"
                          defaultValue={currentProjectType.max_sqft}
                          onBlur={(e) => saveBasePricing({ max_sqft: parseInt(e.target.value) })}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="options" className="space-y-4 mt-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Option Categories</h3>
                    <div className="space-x-2">
                      <Button onClick={() => setShowBulkAdjustDialog(true)} variant="outline">
                        Bulk Labor Adjustment
                      </Button>
                      <Button onClick={() => {
                        setEditingCategory(null);
                        setCategoryFormData({ active: true, required: false });
                        setShowCategoryDialog(true);
                      }}>
                        <Plus className="w-4 h-4 mr-2" />
                        Add Category
                      </Button>
                    </div>
                  </div>

                  {categories.map(category => (
                    <Card key={category.id}>
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              <GripVertical className="w-4 h-4 text-muted-foreground" />
                              {category.name}
                              {category.required && <Badge variant="secondary">Required</Badge>}
                              {!category.active && <Badge variant="outline">Inactive</Badge>}
                            </CardTitle>
                            {category.description && (
                              <CardDescription className="mt-1">{category.description}</CardDescription>
                            )}
                          </div>
                          <div className="space-x-2">
                            <Button variant="ghost" size="sm" onClick={() => openEditCategory(category)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteCategory(category.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Option Name</TableHead>
                              <TableHead className="text-right">Materials</TableHead>
                              <TableHead className="text-right">Labor</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="text-right">Modifier</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items
                              .filter(item => item.option_category_id === category.id)
                              .map(item => (
                                <TableRow key={item.id}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{item.name}</p>
                                      {item.description && (
                                        <p className="text-sm text-muted-foreground">{item.description}</p>
                                      )}
                                      {!item.active && <Badge variant="outline" className="mt-1">Inactive</Badge>}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right">${item.material_cost.toFixed(2)}</TableCell>
                                  <TableCell className="text-right">${item.labor_cost.toFixed(2)}</TableCell>
                                  <TableCell className="text-right font-medium">${item.total_cost.toFixed(2)}</TableCell>
                                  <TableCell className="text-right">
                                    {item.modifier_type && (
                                      <Badge variant="secondary">
                                        {item.modifier_type}: {item.modifier_value}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="sm" onClick={() => openEditItem(item)}>
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                        <Button variant="outline" size="sm" className="mt-2" onClick={() => openNewItem(category.id)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Add Option
                        </Button>
                      </CardContent>
                    </Card>
                  ))}

                  {categories.length === 0 && (
                    <Card>
                      <CardContent className="text-center py-8 text-muted-foreground">
                        No categories yet. Add your first category to start building calculator options.
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="test" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Test Calculator</CardTitle>
                      <CardDescription>
                        Test your pricing configuration without creating actual leads
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => setShowTestDialog(true)}>
                        <TestTube className="w-4 h-4 mr-2" />
                        Run Test Calculation
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category Name</Label>
              <Input
                value={categoryFormData.name || ''}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={categoryFormData.description || ''}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={categoryFormData.required || false}
                onCheckedChange={(checked) => setCategoryFormData({ ...categoryFormData, required: checked })}
              />
              <Label>Required Selection</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={categoryFormData.active !== false}
                onCheckedChange={(checked) => setCategoryFormData({ ...categoryFormData, active: checked })}
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancel</Button>
            <Button onClick={saveCategory}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Option' : 'New Option'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Option Name</Label>
              <Input
                value={itemFormData.name || ''}
                onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={itemFormData.description || ''}
                onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Material Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemFormData.material_cost || 0}
                  onChange={(e) => setItemFormData({ ...itemFormData, material_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Labor Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemFormData.labor_cost || 0}
                  onChange={(e) => setItemFormData({ ...itemFormData, labor_cost: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <Label>Total Cost (auto-calculated)</Label>
              <Input
                type="number"
                value={(Number(itemFormData.material_cost) || 0) + (Number(itemFormData.labor_cost) || 0)}
                disabled
              />
            </div>
            <div>
              <Label>Estimated Labor Hours</Label>
              <Input
                type="number"
                step="0.5"
                value={itemFormData.labor_hours || ''}
                onChange={(e) => setItemFormData({ ...itemFormData, labor_hours: parseFloat(e.target.value) || null })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Modifier Type</Label>
                <Select
                  value={itemFormData.modifier_type || 'none'}
                  onValueChange={(value) => setItemFormData({ ...itemFormData, modifier_type: value === 'none' ? null : value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="additive">Additive</SelectItem>
                    <SelectItem value="multiplicative">Multiplicative</SelectItem>
                    <SelectItem value="reductive">Reductive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modifier Value</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemFormData.modifier_value || ''}
                  onChange={(e) => setItemFormData({ ...itemFormData, modifier_value: parseFloat(e.target.value) || null })}
                  disabled={!itemFormData.modifier_type || itemFormData.modifier_type === 'none'}
                />
              </div>
            </div>
            <div>
              <Label>Display Label (shown to customer)</Label>
              <Input
                value={itemFormData.display_label || ''}
                onChange={(e) => setItemFormData({ ...itemFormData, display_label: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={itemFormData.active !== false}
                onCheckedChange={(checked) => setItemFormData({ ...itemFormData, active: checked })}
              />
              <Label>Active</Label>
            </div>

            {/* Materials List */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-2">
                <Label className="text-base">Materials List</Label>
                <Button variant="outline" size="sm" onClick={addMaterial}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Material
                </Button>
              </div>
              {itemMaterials.map((material, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-3">
                    <Label className="text-xs">Material Name</Label>
                    <Input
                      value={material.material_name}
                      onChange={(e) => updateMaterial(index, 'material_name', e.target.value)}
                      placeholder="e.g., Tile"
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className="text-xs">Quantity Formula</Label>
                    <Input
                      value={material.quantity_formula}
                      onChange={(e) => updateMaterial(index, 'quantity_formula', e.target.value)}
                      placeholder="e.g., sq_ft * 1.1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Unit</Label>
                    <Input
                      value={material.unit}
                      onChange={(e) => updateMaterial(index, 'unit', e.target.value)}
                      placeholder="sq ft"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Waste %</Label>
                    <Input
                      type="number"
                      value={material.waste_factor}
                      onChange={(e) => updateMaterial(index, 'waste_factor', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="col-span-2">
                    <Button variant="ghost" size="sm" onClick={() => removeMaterial(index)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>Cancel</Button>
            <Button onClick={saveItem}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Adjust Dialog */}
      <Dialog open={showBulkAdjustDialog} onOpenChange={setShowBulkAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Labor Cost Adjustment</DialogTitle>
            <DialogDescription>
              Adjust all labor costs for {currentProjectType?.display_name} by a percentage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Percentage Change (+ or -)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="e.g., 5 for +5% or -10 for -10%"
                id="bulk-adjust-percentage"
              />
              <p className="text-sm text-muted-foreground mt-1">
                This will adjust labor costs for all options in this project type
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkAdjustDialog(false)}>Cancel</Button>
            <Button onClick={() => {
              const input = document.getElementById('bulk-adjust-percentage') as HTMLInputElement;
              const percentage = parseFloat(input.value);
              if (!isNaN(percentage)) {
                bulkAdjustLabor(percentage);
              }
            }}>
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Calculator Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Calculator - {currentProjectType?.display_name}</DialogTitle>
            <DialogDescription>
              Test your pricing configuration without creating actual leads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Square Footage Input */}
            <div>
              <Label>Square Footage</Label>
              <Input
                type="number"
                value={testSquareFootage}
                onChange={(e) => {
                  const sqft = parseInt(e.target.value) || 0;
                  setTestSquareFootage(sqft);
                  updateTestFormData({ square_footage: sqft });
                }}
                placeholder="Enter square footage"
              />
              {currentProjectType && (
                <p className="text-sm text-muted-foreground mt-1">
                  Range: {currentProjectType.min_sqft} - {currentProjectType.max_sqft} sq ft
                </p>
              )}
            </div>

            {/* Options Selection */}
            {testCategories.map((category) => (
              <div key={category.id} className="space-y-3">
                <div>
                  <Label className="text-base">
                    {category.name}
                    {category.required && <Badge variant="secondary" className="ml-2">Required</Badge>}
                  </Label>
                  {category.description && (
                    <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
                  )}
                </div>
                <RadioGroup
                  value={testFormData.selected_options?.[category.id] || ""}
                  onValueChange={(value) => {
                    updateTestFormData({
                      selected_options: {
                        ...testFormData.selected_options,
                        [category.id]: value,
                      },
                    });
                  }}
                >
                  {category.items.map((item) => (
                    <div key={item.id} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-accent">
                      <RadioGroupItem value={item.id} id={`test-${item.id}`} />
                      <div className="flex-1">
                        <Label htmlFor={`test-${item.id}`} className="font-medium cursor-pointer">
                          {item.display_label || item.name}
                        </Label>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          <span>Materials: ${item.material_cost.toFixed(2)}</span>
                          <span>Labor: ${item.labor_cost.toFixed(2)}</span>
                          <span className="font-medium">Total: ${item.total_cost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}

            {/* Results */}
            {testFormData.square_footage && (
              <Card>
                <CardHeader>
                  <CardTitle>Estimated Cost Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const result = calculateTestEstimate();
                    if (!result) return <p className="text-muted-foreground">Enter square footage to see estimate</p>;
                    
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Base Material Cost</p>
                            <p className="text-lg font-medium">${result.base_material_cost.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Base Labor Cost</p>
                            <p className="text-lg font-medium">${result.base_labor_cost.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Options Material Cost</p>
                            <p className="text-lg font-medium">${result.options_material_cost.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Options Labor Cost</p>
                            <p className="text-lg font-medium">${result.options_labor_cost.toFixed(2)}</p>
                          </div>
                        </div>
                        
                        <div className="border-t pt-4">
                          <p className="text-sm text-muted-foreground mb-2">Total Material Cost</p>
                          <p className="text-xl font-semibold">${result.total_material_cost.toFixed(2)}</p>
                        </div>
                        
                        <div className="border-t pt-4">
                          <p className="text-sm text-muted-foreground mb-2">Total Labor Cost</p>
                          <p className="text-xl font-semibold">${result.total_labor_cost.toFixed(2)}</p>
                        </div>
                        
                        <div className="border-t pt-4">
                          <p className="text-sm text-muted-foreground mb-2">Combined Total</p>
                          <p className="text-xl font-semibold">${result.combined_total.toFixed(2)}</p>
                        </div>
                        
                        <div className="bg-primary/10 p-4 rounded-lg">
                          <p className="text-sm text-muted-foreground mb-2">Estimate Range (±20%)</p>
                          <p className="text-2xl font-bold">
                            ${result.estimate_range_min.toFixed(2)} - ${result.estimate_range_max.toFixed(2)}
                          </p>
                        </div>

                        {result.selected_items.length > 0 && (
                          <div className="border-t pt-4">
                            <p className="text-sm font-medium mb-2">Selected Options:</p>
                            {result.selected_items.map((item, idx) => (
                              <div key={idx} className="text-sm py-1">
                                <span className="font-medium">{item.category_name}:</span> {item.display_label} (${item.total_cost.toFixed(2)})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowTestDialog(false);
              setTestSquareFootage(100);
              updateTestFormData({ square_footage: 100, selected_options: {} });
            }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
